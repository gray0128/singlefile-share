import { D1Helper } from './db.js';
import { R2Helper } from './r2.js';

export async function handleQueue(batch, env) {
    const db = new D1Helper(env.DB);
    const bucket = new R2Helper(env.BUCKET);

    for (const message of batch.messages) {
        try {
            // Message body format from R2 Event Notifications (via Queue)
            // { "account": "...", "bucket": "...", "key": "...", "action": "PutObject", ... }
            const event = message.body;

            // We only care about ObjectCreated (PutObject/CompleteMultipartUpload)
            if (!event.action.startsWith('PutObject') && !event.action.startsWith('CompleteMultipartUpload')) {
                message.ack();
                continue;
            }

            const key = event.key || event.object.key; // Cloudflare Queue format might vary, usually event.key in direct notification? 
            // Standard notification format:
            // { "eventTime": "...", "eventName": "ObjectCreated:Put", "bucket": "...", "object": { "key": "...", "size": 123, "eTag": "..." } }
            // Let's assume standard R2 event structure for now.
            // If using Queues, the body is usually the event payload.

            const objectKey = event.object?.key || event.key;
            if (!objectKey) {
                console.error('Missing key in event', event);
                message.ack();
                continue;
            }

            // Parse User ID from Key: files/{userId}/{filename}
            const match = objectKey.match(/^files\/(\d+)\/(.+)$/);
            if (!match) {
                // Handle Root Files (e.g. SingleFile Direct Upload)
                if (!objectKey.includes('/')) {
                    console.log(`Root file detected: ${objectKey}. Attempting to move to admin.`);
                    const admin = await db.getFirstAdmin();
                    if (admin) {
                        const object = await bucket.get(objectKey);
                        if (object) {
                            const ext = objectKey.includes('.') ? objectKey.split('.').pop() : 'html';
                            const newKey = `files/${admin.id}/${crypto.randomUUID()}.${ext}`;

                            await bucket.put(newKey, object.body, {
                                httpMetadata: object.httpMetadata,
                                customMetadata: object.customMetadata,
                            });

                            await bucket.delete(objectKey);
                            console.log(`Moved root file ${objectKey} to ${newKey}`);

                            // Acknowledge this message. The new PUT will trigger a new event.
                            message.ack();
                            continue;
                        }
                    } else {
                        console.warn('Root file detected but no admin found to assign.');
                    }
                }

                console.log(`Key ${objectKey} does not match pattern, ignoring.`);
                message.ack();
                continue;
            }

            const userId = match[1];
            const filename = match[2];

            // Check if file already exists in DB?
            // If this is a re-upload or direct upload, we might need to sync DB.
            // But we need Title. So we must read the file (or first few KB).

            // Fetch object to parse title
            // Range request for first 10KB (usually enough for <title>)
            const objectHead = await bucket.bucket.get(objectKey, { range: { length: 10240 } });

            if (!objectHead) {
                console.error(`Object ${objectKey} not found in bucket.`);
                message.ack();
                continue;
            }

            const chunk = await objectHead.text();

            // Extract Title
            const titleMatch = chunk.match(/<title>([^<]+)<\/title>/i);
            const displayName = titleMatch ? titleMatch[1].trim() : filename;

            // Get File Size
            const size = event.object?.size || objectHead.size; // Event might have size, or use head

            // Determine Mime Type
            const mimeType = objectHead.httpMetadata?.contentType || 'text/html';

            // Insert into D1
            // Use key as r2_key
            // Since this might be duplicate execution, we should check if exists?
            // But schema says just insert. Duplicate uploads -> new file entries?
            // Ideally we check if (user_id, r2_key) exists?
            // Or `files` table uses `id` as PK, `r2_key` is not unique.
            // Let's just create a new file entry for now, as re-uploading via SingleFile implies a NEW snapshot usually.

            await db.createFile(userId, filename, displayName, size, objectKey, mimeType);

            console.log(`Processed upload for ${objectKey}`);
            message.ack();

        } catch (error) {
            console.error('Error processing message', error);
            message.retry();
        }
    }
}
