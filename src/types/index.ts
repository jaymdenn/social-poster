export interface Account {
  _id: string;
  id?: string;
  platform: string;
  displayName?: string;
  name?: string;
  username?: string;
  profilePicture?: string;
  profilePictureUrl?: string;
  isActive?: boolean;
}

export interface Post {
  id: string;
  content: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledFor?: string;
  publishedAt?: string;
  accounts: string[];
  platformPostUrls?: Record<string, string>;
}

export interface CreatePostRequest {
  content: string;
  accountIds: string[];
  publishNow?: boolean;
  scheduledFor?: string;
  timezone?: string;
}
