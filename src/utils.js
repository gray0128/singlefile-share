export function extractTextFromHtml(html, inputLimit = 200000, outputLimit = 30000) {
    if (!html) return '';

    // 1. Limit input size to save CPU (increased to 200KB to get more content past noise)
    let content = html.substring(0, inputLimit);

    // 2. Remove script and style tags and their content
    content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, ' ');
    content = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, ' ');

    // 3. Remove SVG tags and their content (icons, vector graphics)
    content = content.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gim, ' ');

    // 4. Remove noscript tags (usually contain fallback images with base64)
    content = content.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gim, ' ');

    // 5. Remove HTML comments (SingleFile preserves original comments)
    content = content.replace(/<!--[\s\S]*?-->/g, ' ');

    // 6. Remove navigation, header, footer elements (non-body-content)
    content = content.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gim, ' ');
    content = content.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gim, ' ');
    content = content.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gim, ' ');

    // 7. Remove base64 data URIs (images, fonts embedded by SingleFile)
    content = content.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, ' ');
    // Also catch url(...) with data URIs that might be in remaining inline styles
    content = content.replace(/url\(["']?data:[^)]+\)["']?/g, ' ');

    // 8. Remove all HTML tag attributes before stripping tags
    //    This removes style="...", class="...", srcset="...", aria-*, data-* etc.
    //    Converts <div style="..." class="..."> to <div>
    content = content.replace(/<([a-zA-Z][a-zA-Z0-9]*)\s+[^>]*>/g, '<$1>');

    // 9. Remove all HTML tags
    content = content.replace(/<[^>]+>/g, ' ');

    // 10. Decode common HTML entities
    content = content
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x[0-9a-fA-F]+;/g, ' ')
        .replace(/&#\d+;/g, ' ');

    // 11. Remove long non-space strings (hashes, encoded data, CSS class names)
    //     Any "word" longer than 80 chars is almost certainly not natural text
    content = content.replace(/\S{80,}/g, ' ');

    // 12. Collapse whitespace
    content = content.replace(/\s+/g, ' ').trim();

    // 13. Limit output size for storage
    if (content.length > outputLimit) {
        content = content.substring(0, outputLimit);
    }

    return content;
}
