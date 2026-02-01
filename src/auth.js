export class AuthHelper {
    constructor(env) {
        this.clientId = env.GITHUB_CLIENT_ID;
        this.clientSecret = env.GITHUB_CLIENT_SECRET;
        this.jwtSecret = env.JWT_SECRET || 'dev-secret';
    }

    async redirect() {
        const params = new URLSearchParams({
            client_id: this.clientId,
            scope: 'read:user',
        });
        return Response.redirect(
            `https://github.com/login/oauth/authorize?${params.toString()}`,
            302
        );
    }

    async callback(request) {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');

        if (!code) {
            return new Response('Missing code', { status: 400 });
        }

        // Exchange code for token
        const tokenResponse = await fetch(
            'https://github.com/login/oauth/access_token',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'User-Agent': 'singlefile-share',
                },
                body: JSON.stringify({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code,
                }),
            }
        );

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
            return new Response(tokenData.error_description || 'Auth failed', { status: 400 });
        }

        const accessToken = tokenData.access_token;

        // Get User Info
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'singlefile-share',
            },
        });

        if (!userResponse.ok) {
            return new Response('Failed to fetch user info', { status: 500 });
        }

        const userData = await userResponse.json();
        return userData; // Return raw github user data for worker to handle DB sync
    }
}

// Simple Session Management using signed cookies
export async function createSessionCookie(userId, secret) {
    const payload = btoa(JSON.stringify({ userId, exp: Date.now() + 86400 * 1000 * 7 })); // 7 days
    const safePayload = encodeURIComponent(payload);
    return `session=${safePayload}; HttpOnly; Path=/; SameSite=Lax; Secure`;
}

export async function verifySession(request) {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;

    const cookies = {};
    for (const cookie of cookieHeader.split(';')) {
        const parts = cookie.trim().split('=');
        if (parts.length >= 2) {
            const name = parts[0];
            const value = parts.slice(1).join('=');
            cookies[name] = value;
        }
    }

    if (!cookies.session) return null;

    try {
        // Decode URI component to handle %3D (=) and other special chars
        const decoded = decodeURIComponent(cookies.session);
        const payload = JSON.parse(atob(decoded));
        if (payload.exp < Date.now()) return null;
        return payload.userId;
    } catch (e) {
        return null;
    }
}

export function createLogoutResponse() {
    return new Response(null, {
        status: 302,
        headers: {
            'Location': '/',
            'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure'
        }
    });
}
