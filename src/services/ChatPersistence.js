import { supabase } from './SupabaseClient';

const MESSAGE_SELECT = `
  id,
  room_id,
  sender_id,
  client_message_id,
  message_type,
  encrypted_payload,
  media_path,
  media_mime_type,
  media_size,
  created_at,
  ttl_seconds,
  expires_at,
  delivered_at,
  read_at
`;

class ChatPersistence {
  constructor() {
    this.user = null;
    this.roomId = null;
    this.channel = null;
    this.onRealtimeStatus = null;
  }

  async ensureAuthenticated() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (sessionData?.session?.user) {
      this.user = sessionData.session.user;
      return this.user;
    }

    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      throw error;
    }

    if (!data?.user) {
      throw new Error('Anonymous authentication failed');
    }

    this.user = data.user;
    return this.user;
  }

  async joinRoom(pairCode) {
    const normalizedPairCode = String(pairCode || '').trim().toUpperCase();

    if (!normalizedPairCode) {
      throw new Error('Pair code is required');
    }

    await this.ensureAuthenticated();

    const { data, error } = await supabase.rpc(
      'get_or_create_chat_room',
      { p_pair_code: normalizedPairCode }
    );

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Chat room was not returned');
    }

    this.roomId = data;
    return this.roomId;
  }

  async loadMessages() {
    if (!this.roomId) {
      throw new Error('Chat room has not been initialized');
    }

    try {
      await this.purgeExpiredMessages();
    } catch (error) {
      console.warn('[ChatPersistence] Expired-message cleanup failed:', error);
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('chat_messages')
      .select(MESSAGE_SELECT)
      .eq('room_id', this.roomId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async saveMessage({
    clientMessageId,
    messageType,
    encryptedPayload,
    ttlSeconds = null,
    media = null
  }) {
    if (!this.roomId) {
      throw new Error('Chat room is not initialized');
    }

    if (!this.user) {
      await this.ensureAuthenticated();
    }

    if (!clientMessageId) {
      throw new Error('clientMessageId is required');
    }

    if (!messageType) {
      throw new Error('messageType is required');
    }

    if (typeof encryptedPayload !== 'string') {
      throw new Error('encryptedPayload must be a string');
    }

    const { data, error } = await supabase.rpc(
      'insert_chat_message',
      {
        p_room_id: this.roomId,
        p_client_message_id: clientMessageId,
        p_message_type: messageType,
        p_encrypted_payload: encryptedPayload,
        p_ttl_seconds: ttlSeconds ?? null,
        p_media_path: media?.path ?? null,
        p_media_mime_type: media?.mimeType ?? null,
        p_media_size: media?.size ?? null
      }
    );

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Message storage returned no result');
    }

    return data;
  }

  async markDelivered(messageId) {
    if (!messageId || !this.user) {
      return;
    }

    const { error } = await supabase.rpc(
      'mark_message_delivered',
      { p_message_id: messageId }
    );

    if (error && !error.message?.includes('cannot alter own message state')) {
      console.warn('[ChatPersistence] markDelivered failed:', error.message);
    }
  }

  async markRead(messageId) {
    if (!messageId || !this.user) {
      return;
    }

    const { error } = await supabase.rpc(
      'mark_message_read',
      { p_message_id: messageId }
    );

    if (error && !error.message?.includes('cannot alter own message state')) {
      console.warn('[ChatPersistence] markRead failed:', error.message);
    }
  }

  async purgeExpiredMessages() {
    if (!this.roomId) {
      return 0;
    }

    const { data, error } = await supabase.rpc(
      'purge_expired_chat_messages',
      { p_room_id: this.roomId }
    );

    if (error) {
      throw error;
    }

    return Number(data) || 0;
  }

  subscribeToMessages(onInsert, onUpdate) {
    if (!this.roomId) {
      throw new Error('Chat room has not been initialized');
    }

    this.unsubscribe();

    this.channel = supabase
      .channel(`chat-room-${this.roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${this.roomId}`
        },
        (payload) => {
          if (payload?.new) {
            onInsert?.(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${this.roomId}`
        },
        (payload) => {
          if (payload?.new) {
            onUpdate?.(payload.new);
          }
        }
      )
      .subscribe((status) => {
        this.onRealtimeStatus?.(status);
      });

    return this.channel;
  }

  setRealtimeStatusHandler(handler) {
    this.onRealtimeStatus = handler;
  }

  unsubscribe() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  async registerPeerId(peerId) {
    if (!this.roomId || !this.user) {
      return;
    }

    const { error } = await supabase.rpc(
      'set_chat_member_peer',
      {
        p_room_id: this.roomId,
        p_peer_id: peerId ?? null
      }
    );

    if (error) {
      console.warn('[ChatPersistence] registerPeerId failed:', error.message);
    }
  }

  async getPartner() {
    if (!this.roomId) {
      return null;
    }

    const { data, error } = await supabase.rpc(
      'get_chat_partner',
      { p_room_id: this.roomId }
    );

    if (error || !data?.found) {
      return null;
    }

    return data;
  }

  async updateLastSeen() {
    if (!this.roomId || !this.user) {
      return;
    }

    const { error } = await supabase
      .from('chat_room_members')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('room_id', this.roomId)
      .eq('user_id', this.user.id);

    if (error) {
      console.warn('[ChatPersistence] last_seen update failed:', error.message);
    }
  }

  async resetRoom(pairCode) {
    const normalizedPairCode = String(pairCode || '').trim().toUpperCase();
    if (!normalizedPairCode) {
      throw new Error('Pair code is required');
    }

    await this.ensureAuthenticated();

    const { data, error } = await supabase.rpc(
      'reset_chat_room',
      { p_pair_code: normalizedPairCode }
    );

    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  cleanup() {
    this.unsubscribe();
    this.onRealtimeStatus = null;
    this.user = null;
    this.roomId = null;
  }
}

export const chatPersistence = new ChatPersistence();