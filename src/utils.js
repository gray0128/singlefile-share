export function extractTextFromHtml(html, inputLimit = 100000, outputLimit = 30000) {
    if (!html) return '';

    // 1. Limit input size to save CPU
    // We only process the beginning of the file which usually contains the most relevant info
    let content = html.substring(0, inputLimit);

    // 2. Remove script and style tags and their content
    content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, " ");
    content = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, " ");

    // 3. Remove all HTML tags
    content = content.replace(/<[^>]+>/g, " ");

    // 4. Decode common entities (basic set for speed)
    content = content
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    // 5. Collapse whitespace
    content = content.replace(/\s+/g, " ").trim();

    // 6. Limit output size for storage
    if (content.length > outputLimit) {
        content = content.substring(0, outputLimit);
    }

    return content;
}
