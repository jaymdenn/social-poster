import { NextRequest, NextResponse } from 'next/server';

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;
const AYRSHARE_API_URL = 'https://api.ayrshare.com/api';

export async function POST(request: NextRequest) {
  if (!AYRSHARE_API_KEY) {
    return NextResponse.json(
      { error: 'Ayrshare API key not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { content, accountIds, publishNow, scheduledFor, timezone, mediaUrls } = body;

    if (!accountIds || accountIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one platform is required' },
        { status: 400 }
      );
    }

    // Content is required unless media is provided
    if (!content && (!mediaUrls || mediaUrls.length === 0)) {
      return NextResponse.json(
        { error: 'Content or media is required' },
        { status: 400 }
      );
    }

    // Ayrshare uses 'platforms' array with platform names and 'post' for content
    const postData: Record<string, unknown> = {
      platforms: accountIds, // accountIds are platform names in Ayrshare (e.g., 'twitter', 'facebook')
    };

    if (content) {
      postData.post = content;
    }

    if (mediaUrls && mediaUrls.length > 0) {
      postData.mediaUrls = mediaUrls;
    }

    // Handle scheduling
    if (!publishNow && scheduledFor) {
      // Ayrshare expects ISO 8601 format for scheduleDate
      postData.scheduleDate = scheduledFor;
    }

    const response = await fetch(`${AYRSHARE_API_URL}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AYRSHARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
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
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to create post:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}

export async function GET() {
  if (!AYRSHARE_API_KEY) {
    return NextResponse.json(
      { error: 'Ayrshare API key not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${AYRSHARE_API_URL}/history`, {
      headers: {
        'Authorization': `Bearer ${AYRSHARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ayrshare API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Ayrshare API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}
