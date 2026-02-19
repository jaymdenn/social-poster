import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await request.json();
    const { filename, contentType } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'filename and contentType are required' },
        { status: 400 }
      );
    }

    // Create a unique file path using timestamp
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `uploads/${timestamp}-${sanitizedFilename}`;

    // Create a signed upload URL
    const { data, error } = await supabase.storage
      .from('media')
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error('Supabase storage error:', error);
      return NextResponse.json(
        { error: `Storage error: ${error.message}` },
        { status: 500 }
      );
    }

    // Construct the public URL
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${filePath}`;

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      publicUrl: publicUrl,
    });
  } catch (error) {
    console.error('Failed to get presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to get presigned URL' },
      { status: 500 }
    );
  }
}
