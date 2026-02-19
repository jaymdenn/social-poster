import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

interface GenerateRequest {
  mediaBase64?: string;
  mediaMimeType?: string;
  mediaUrl?: string;
  platforms: string[];
  tone?: string;
  additionalContext?: string;
}

export async function POST(request: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'OpenRouter API key not configured' },
      { status: 500 }
    );
  }

  try {
    const body: GenerateRequest = await request.json();
    const { mediaBase64, mediaMimeType, mediaUrl, platforms, tone, additionalContext } = body;

    if (!mediaBase64 && !mediaUrl) {
      return NextResponse.json(
        { error: 'Either mediaBase64 or mediaUrl is required' },
        { status: 400 }
      );
    }

    // Build the prompt
    const platformList = platforms.length > 0 ? platforms.join(', ') : 'social media';
    const toneInstruction = tone ? `Use a ${tone} tone.` : 'Use an engaging, professional tone.';
    const contextInstruction = additionalContext ? `Additional context: ${additionalContext}` : '';

    const systemPrompt = `You are a social media content expert. Generate engaging post captions based on the provided media content.

Guidelines:
- Create a caption that would perform well on ${platformList}
- ${toneInstruction}
- Keep it concise but engaging (under 280 characters for Twitter/X compatibility)
- Include relevant hashtags at the end (3-5 hashtags)
- Include a call-to-action when appropriate
- Make it feel authentic, not overly promotional
${contextInstruction}

Respond with ONLY the caption text including hashtags. No explanations or alternatives.`;

    // Build messages array with media
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    // Check if it's a video
    const isVideo = mediaMimeType?.startsWith('video/');

    // Add media content - use base64 data URL for both images and videos
    // Gemini via OpenRouter accepts video as image_url with data: URI
    if (mediaBase64 && mediaMimeType) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${mediaMimeType};base64,${mediaBase64}`,
        },
      });
    } else if (mediaUrl) {
      // Fallback for URLs (mainly for images)
      content.push({
        type: 'image_url',
        image_url: {
          url: mediaUrl,
        },
      });
    }

    // Add text prompt
    if (isVideo) {
      content.push({
        type: 'text',
        text: 'Watch this video carefully, understand its content, any spoken words or text shown, and generate an engaging social media caption for it. The caption should relate directly to what happens in the video.',
      });
    } else {
      content.push({
        type: 'text',
        text: 'Analyze this media and generate an engaging social media caption for it.',
      });
    }

    // Call OpenRouter with Gemini
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'Social Poster',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return NextResponse.json(
        { error: `AI generation failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices?.[0]?.message?.content;

    if (!generatedContent) {
      return NextResponse.json(
        { error: 'No content generated' },
        { status: 500 }
      );
    }

    return NextResponse.json({ content: generatedContent.trim() });
  } catch (error) {
    console.error('Failed to generate content:', error);
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    );
  }
}
