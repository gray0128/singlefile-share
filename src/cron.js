import { D1Helper } from './db.js';
import { R2Helper } from './r2.js';

export async function handleScheduled(event, env, ctx) {
    const db = new D1Helper(env.DB);
    const bucket = new R2Helper(env.BUCKET);

    console.log('Running Scheduled Sync...');

    try {
        // 1. Get all known file keys from DB
        const dbFiles = await db.getAllFileKeys();
        const dbKeySet = new Set(dbFiles.map(f => f.r2_key));

        // 2. List all objects in R2
        let truncated = true;
        let cursor = undefined;

        while (truncated) {
            const list = await bucket.bucket.list({ limit: 500, cursor });
            truncated = list.truncated;
            cursor = list.cursor;

            for (const object of list.objects) {
                // If known, skip
                if (dbKeySet.has(object.key)) continue;

                console.log(`Found new file: ${object.key}`);

                // 3. Process New File
                await processNewFile(object.key, bucket, db, env);
            }
        }
        console.log('Sync Complete.');

    } catch (e) {
        console.error('Sync Error:', e);
    }
}

async function processNewFile(key, bucket, db, env) {
    // Check for Root File
    if (!key.includes('/')) {
        console.log(`Processing Root File: ${key}`);
        const admin = await db.getFirstAdmin();

        if (!admin) {
            console.warn('No admin found, leaving file in root.');
            return;
        }

        const object = await bucket.get(key);
        if (!object) return;

        // Generate new key
        const ext = key.includes('.') ? key.split('.').pop() : 'html';
        const newKey = `files/${admin.id}/${crypto.randomUUID()}.${ext}`;

        // Move (Copy + Delete)
        try {
            await bucket.put(newKey, object.body, {
                httpMetadata: object.httpMetadata,
                customMetadata: {
                    ...object.customMetadata,
                    original_filename: key
                },
            });
            await bucket.delete(key);
            console.log(`Moved ${key} to ${newKey}`);

            // Now recursively process the NEW key to insert into DB
            await processNewFile(newKey, bucket, db, env);
        } catch (e) {
            console.error(`Failed to move ${key}`, e);
        }
        return;
    }

    // Normal User File: files/{user_id}/{filename}
    const match = key.match(/^files\/(\d+)\/(.+)$/);
    if (!match) {
        console.warn(`Unknown file structure: ${key}`);
        return;
    }

    const userId = match[1];
    let filename = match[2];

    // Read Head for Title
    try {
        const objectHead = await bucket.bucket.get(key, { range: { length: 10240 } });
        if (!objectHead) return;

        // Restore original filename from metadata if available (for moved files)
        if (objectHead.customMetadata && objectHead.customMetadata.original_filename) {
            filename = objectHead.customMetadata.original_filename;
        }

        const chunk = await objectHead.text();
        const titleMatch = chunk.match(/<title>([^<]+)<\/title>/i);
        // Fallback checks for display name
        const displayName = titleMatch ? titleMatch[1].trim() : filename;

        const size = objectHead.size;
        const mimeType = objectHead.httpMetadata?.contentType || 'text/html';

        await db.createFile(userId, filename, displayName, size, key, mimeType);
        console.log(`Registered ${key} for user ${userId} as ${filename}`);

    } catch (e) {
        console.error(`Failed to register ${key}`, e);
    }
}
