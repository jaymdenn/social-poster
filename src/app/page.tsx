/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, useRef } from 'react';
import { Account } from '@/types';

// Platform icons/colors
const platformColors: Record<string, string> = {
  twitter: 'bg-black',
  x: 'bg-black',
  instagram: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500',
  facebook: 'bg-blue-600',
  linkedin: 'bg-blue-700',
  tiktok: 'bg-black',
  youtube: 'bg-red-600',
  pinterest: 'bg-red-500',
  reddit: 'bg-orange-600',
  bluesky: 'bg-blue-400',
  threads: 'bg-black',
};

const platformLabels: Record<string, string> = {
  twitter: 'X (Twitter)',
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  bluesky: 'Bluesky',
  threads: 'Threads',
};

interface MediaFile {
  file: File;
  preview: string;
  publicUrl?: string;
  uploading: boolean;
  progress: number;
  error?: string;
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      mediaFiles.forEach(mf => URL.revokeObjectURL(mf.preview));
    };
  }, [mediaFiles]);

  async function fetchAccounts() {
    try {
      setLoading(true);
      const res = await fetch('/api/accounts');
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch accounts');
      }

      const accountList = data.accounts || data.data || data || [];
      setAccounts(Array.isArray(accountList) ? accountList : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }

  function getAccountId(account: Account): string {
    return account._id || account.id || '';
  }

  function toggleAccount(accountId: string) {
    setSelectedAccounts(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newMediaFiles: MediaFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file type
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        setError(`File "${file.name}" is not a supported image or video format`);
        continue;
      }

      // Create preview
      const preview = URL.createObjectURL(file);

      newMediaFiles.push({
        file,
        preview,
        uploading: false,
        progress: 0,
      });
    }

    const startIndex = mediaFiles.length;
    setMediaFiles(prev => [...prev, ...newMediaFiles]);

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Upload each file
    newMediaFiles.forEach((mf, i) => {
      uploadFile(mf, startIndex + i);
    });
  }

  async function uploadFile(mediaFile: MediaFile, index: number) {
    // Update state to show uploading
    setMediaFiles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], uploading: true, progress: 0, error: undefined };
      return updated;
    });

    try {
      // Step 1: Get presigned URL from our API
      const presignRes = await fetch('/api/media/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: mediaFile.file.name,
          contentType: mediaFile.file.type,
        }),
      });

      if (!presignRes.ok) {
        const errorData = await presignRes.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, publicUrl } = await presignRes.json();

      // Step 2: Upload file to presigned URL
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mediaFile.file.type,
        },
        body: mediaFile.file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      // Update state with success
      setMediaFiles(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], uploading: false, progress: 100, publicUrl };
        return updated;
      });
    } catch (err) {
      // Update state with error
      setMediaFiles(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          uploading: false,
          error: err instanceof Error ? err.message : 'Upload failed',
        };
        return updated;
      });
    }
  }

  function removeMedia(preview: string) {
    setMediaFiles(prev => {
      const file = prev.find(mf => mf.preview === preview);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(mf => mf.preview !== preview);
    });
  }

  async function generateContent() {
    if (mediaFiles.length === 0) {
      setError('Please add media first to generate content');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      // Use the first media file for generation
      const mediaFile = mediaFiles[0];

      // Get selected platform names for context
      const selectedPlatforms = selectedAccounts
        .map(id => {
          const account = accounts.find(a => (a._id || a.id) === id);
          return account?.platform;
        })
        .filter(Boolean) as string[];

      const isVideo = mediaFile.file.type.startsWith('video/');

      // Check file size - reject videos over 200MB (very large files may timeout)
      const maxSizeMB = isVideo ? 200 : 20;
      if (mediaFile.file.size > maxSizeMB * 1024 * 1024) {
        throw new Error(`${isVideo ? 'Video' : 'Image'} is too large (max ${maxSizeMB}MB). Please use a smaller file.`);
      }

      // Convert media to base64 for AI analysis (both images and videos)
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:image/jpeg;base64," or "data:video/mp4;base64,")
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(mediaFile.file);
      const base64 = await base64Promise;

      const requestBody: Record<string, unknown> = {
        mediaBase64: base64,
        mediaMimeType: mediaFile.file.type,
        platforms: selectedPlatforms,
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to generate content');
      }

      setContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate content');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const hasContent = content.trim().length > 0;
    const uploadedMedia = mediaFiles.filter(mf => mf.publicUrl && !mf.uploading && !mf.error);
    const hasMedia = uploadedMedia.length > 0;
    const isUploading = mediaFiles.some(mf => mf.uploading);
    const hasUploadErrors = mediaFiles.some(mf => mf.error);

    if (isUploading) {
      setError('Please wait for media uploads to complete');
      return;
    }

    if (!hasContent && !hasMedia) {
      setError('Please enter some content or upload media');
      return;
    }

    if (hasUploadErrors && !hasContent) {
      setError('Some media failed to upload. Please remove failed items or add text content.');
      return;
    }

    if (selectedAccounts.length === 0) {
      setError('Please select at least one account');
      return;
    }

    if (publishMode === 'schedule' && (!scheduledDate || !scheduledTime)) {
      setError('Please select a date and time for scheduling');
      return;
    }

    setPosting(true);

    try {
      const postData: Record<string, unknown> = {
        accountIds: selectedAccounts,
      };

      if (hasContent) {
        postData.content = content.trim();
      }

      // Include uploaded media URLs
      if (hasMedia) {
        postData.mediaUrls = uploadedMedia.map(mf => mf.publicUrl);
      }

      if (publishMode === 'now') {
        postData.publishNow = true;
      } else {
        postData.scheduledFor = `${scheduledDate}T${scheduledTime}:00`;
        postData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to create post');
      }

      setSuccess(
        publishMode === 'now'
          ? 'Post published successfully!'
          : 'Post scheduled successfully!'
      );
      setContent('');
      setSelectedAccounts([]);
      setScheduledDate('');
      setScheduledTime('');
      // Clear media files
      mediaFiles.forEach(mf => URL.revokeObjectURL(mf.preview));
      setMediaFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setPosting(false);
    }
  }

  // Get minimum date/time for scheduling (now)
  const now = new Date();
  const minDate = now.toISOString().split('T')[0];
  const minTime = now.toTimeString().slice(0, 5);

  const hasContent = content.trim().length > 0;
  const uploadedMedia = mediaFiles.filter(mf => mf.publicUrl && !mf.uploading && !mf.error);
  const hasUploadedMedia = uploadedMedia.length > 0;
  const isUploading = mediaFiles.some(mf => mf.uploading);
  const canSubmit = selectedAccounts.length > 0 && (hasContent || hasUploadedMedia) && !isUploading;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Social Poster
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Post to your social media accounts
          </p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Select Accounts
            </label>

            {loading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading accounts...
              </div>
            ) : accounts.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">
                No accounts connected. Please connect accounts in your Late.dev dashboard.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {accounts.map(account => {
                  const accountId = getAccountId(account);
                  const accountName = account.displayName || account.name || account.username || 'Unknown';
                  return (
                    <button
                      key={accountId}
                      type="button"
                      onClick={() => toggleAccount(accountId)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                        selectedAccounts.includes(accountId)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {account.profilePicture ? (
                        <img
                          src={account.profilePicture}
                          alt={accountName}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                            platformColors[account.platform?.toLowerCase()] || 'bg-gray-500'
                          }`}
                        >
                          {accountName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="text-left flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {accountName}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {platformLabels[account.platform?.toLowerCase()] || account.platform}
                        </div>
                      </div>
                      {selectedAccounts.includes(accountId) && (
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Media Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Media
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Upload images or videos to include with your post. You can also use AI to generate captions.
            </p>

            {/* File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="media-upload"
            />

            {/* Upload Button */}
            <label
              htmlFor="media-upload"
              className="flex items-center justify-center gap-2 w-full py-4 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-gray-600 dark:text-gray-400">
                Click to upload images or videos
              </span>
            </label>

            {/* Media Previews */}
            {mediaFiles.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mediaFiles.map((mediaFile, index) => (
                  <div key={mediaFile.preview} className="relative group">
                    {/* Preview */}
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      {mediaFile.file.type.startsWith('video/') ? (
                        <video
                          src={mediaFile.preview}
                          className="w-full h-full object-cover"
                          muted
                        />
                      ) : (
                        <img
                          src={mediaFile.preview}
                          alt={`Upload ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      )}

                      {/* Video indicator */}
                      {mediaFile.file.type.startsWith('video/') && (
                        <div className="absolute bottom-2 left-2 bg-black/70 rounded px-2 py-1">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}

                      {/* Upload status indicator */}
                      {mediaFile.uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        </div>
                      )}

                      {/* Success indicator */}
                      {mediaFile.publicUrl && !mediaFile.uploading && (
                        <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1" title="Uploaded successfully">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}

                      {/* Error indicator */}
                      {mediaFile.error && (
                        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                          <div className="bg-red-500 rounded-full p-2" title={mediaFile.error}>
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeMedia(mediaFile.preview)}
                      className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Post Content {mediaFiles.length > 0 ? '(optional with media)' : ''}
              </label>
              {mediaFiles.length > 0 && (
                <button
                  type="button"
                  onClick={generateContent}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {generating ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {mediaFiles[0]?.file.type.startsWith('video/') ? 'Analyzing video...' : 'Generating...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Auto-Generate
                    </>
                  )}
                </button>
              )}
            </div>
            <textarea
              id="content"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder={mediaFiles.length > 0 ? "Click 'Auto-Generate' to create a caption from your media, or type your own..." : "What's on your mind?"}
            />
            <div className="mt-1 text-right text-sm text-gray-500">
              {content.length} characters
            </div>
          </div>

          {/* Publish Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              When to Post
            </label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setPublishMode('now')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                  publishMode === 'now'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                Post Now
              </button>
              <button
                type="button"
                onClick={() => setPublishMode('schedule')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                  publishMode === 'schedule'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                Schedule
              </button>
            </div>
          </div>

          {/* Schedule Inputs */}
          {publishMode === 'schedule' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  id="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  min={minDate}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Time
                </label>
                <input
                  type="time"
                  id="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  min={scheduledDate === minDate ? minTime : undefined}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={posting || !canSubmit}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {posting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {publishMode === 'now' ? 'Publishing...' : 'Scheduling...'}
              </>
            ) : (
              publishMode === 'now' ? 'Publish Now' : 'Schedule Post'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
