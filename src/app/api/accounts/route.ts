import { NextResponse } from 'next/server';

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;
const AYRSHARE_API_URL = 'https://api.ayrshare.com/api';

export async function GET() {
  if (!AYRSHARE_API_KEY) {
    return NextResponse.json(
      { error: 'Ayrshare API key not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${AYRSHARE_API_URL}/user`, {
      headers: {
        'Authorization': `Bearer ${AYRSHARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ayrshare API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Ayrshare API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    // Ayrshare returns activeSocialAccounts array with platform names
    // Transform to match our expected format with id and platform fields
    const activeSocialAccounts = data.activeSocialAccounts || [];
    const accounts = activeSocialAccounts.map((platform: string) => ({
      id: platform,
      platform: platform,
      name: platform.charAt(0).toUpperCase() + platform.slice(1),
    }));

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Failed to fetch accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
