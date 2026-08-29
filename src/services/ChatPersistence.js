// src/services/ChatPersistence.js

import { supabase } from './SupabaseClient';

const MESSAGE_SELECT = `
  id,
  room_id,
  sender_id,
  client_message_id,
  message_type,
  encrypted_payload,
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
    }

    /*
     * ----------------------------------------------------------
     * AUTHENTICATION
     * ----------------------------------------------------------
     */

    async ensureAuthenticated() {
        const {
            data: { session },
            error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError) {
            throw sessionError;
        }

        if (session?.user) {
            this.user = session.user;
            return session.user;
        }

        const {
            data,
            error
        } = await supabase.auth.signInAnonymously();

        if (error) {
            throw error;
        }

        if (!data?.user) {
            throw new Error(
                'Anonymous authentication failed'
            );
        }

        this.user = data.user;

        return data.user;
    }

    /*
     * ----------------------------------------------------------
     * ROOM
     * ----------------------------------------------------------
     */

    async joinRoom(pairCode) {
        const normalizedPairCode =
            String(pairCode || '').trim();

        if (!normalizedPairCode) {
            throw new Error(
                'Pair code is required'
            );
        }

        await this.ensureAuthenticated();

        const {
            data,
            error
        } = await supabase.rpc(
            'get_or_create_chat_room',
            {
                p_pair_code:
                    normalizedPairCode
            }
        );

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error(
                'Chat room was not returned'
            );
        }

        this.roomId = data;

        return this.roomId;
    }

    /*
     * ----------------------------------------------------------
     * LOAD MESSAGE HISTORY
     * ----------------------------------------------------------
     */

    async loadMessages() {
        if (!this.roomId) {
            throw new Error(
                'Chat room has not been initialized'
            );
        }

        try {
            await this.purgeExpiredMessages();
        } catch (error) {
            console.warn(
                '[ChatPersistence] Expired-message cleanup failed:',
                error
            );
        }

        const {
            data,
            error
        } = await supabase
            .from('chat_messages')
            .select(MESSAGE_SELECT)
            .eq(
                'room_id',
                this.roomId
            )
            .order(
                'created_at',
                {
                    ascending: true
                }
            );

        if (error) {
            throw error;
        }

        return data || [];
    }

    /*
     * ----------------------------------------------------------
     * SAVE ENCRYPTED MESSAGE
     * ----------------------------------------------------------
     */

    async saveMessage({
        clientMessageId,
        messageType,
        encryptedPayload,
        ttlSeconds = null,
        expiresAt = null
    }) {
        if (!this.roomId) {
            throw new Error(
                'Chat room is not initialized'
            );
        }

        if (!this.user) {
            await this.ensureAuthenticated();
        }

        if (!clientMessageId) {
            throw new Error(
                'clientMessageId is required'
            );
        }

        if (!messageType) {
            throw new Error(
                'messageType is required'
            );
        }

        if (
            typeof encryptedPayload !==
            'string'
        ) {
            throw new Error(
                'encryptedPayload must be a string'
            );
        }

        /*
         * The client message ID is the idempotency key.
         *
         * This prevents a message from being inserted twice
         * if the application retries the operation.
         */

        const {
            data: existingMessage,
            error: lookupError
        } = await supabase
            .from('chat_messages')
            .select(MESSAGE_SELECT)
            .eq(
                'room_id',
                this.roomId
            )
            .eq(
                'client_message_id',
                clientMessageId
            )
            .maybeSingle();

        if (lookupError) {
            throw lookupError;
        }

        if (existingMessage) {
            return existingMessage;
        }

        const {
            data,
            error
        } = await supabase
            .from('chat_messages')
            .insert({
                room_id:
                    this.roomId,

                sender_id:
                    this.user.id,

                client_message_id:
                    clientMessageId,

                message_type:
                    messageType,

                encrypted_payload:
                    encryptedPayload,

                ttl_seconds:
                    ttlSeconds,

                expires_at:
                    expiresAt
            })
            .select(MESSAGE_SELECT)
            .single();

        if (error) {
            throw error;
        }

        return data;
    }

    /*
     * ----------------------------------------------------------
     * DELIVERY / READ STATE
     * ----------------------------------------------------------
     */

    async markDelivered(messageId) {
        if (!messageId) {
            return;
        }

        const {
            error
        } = await supabase
            .from('chat_messages')
            .update({
                delivered_at:
                    new Date().toISOString()
            })
            .eq(
                'id',
                messageId
            )
            .is(
                'delivered_at',
                null
            );

        if (error) {
            console.error(
                '[ChatPersistence] markDelivered failed:',
                error
            );
        }
    }

    async markRead(messageId) {
        if (!messageId) {
            return;
        }

        const {
            error
        } = await supabase
            .from('chat_messages')
            .update({
                read_at:
                    new Date().toISOString()
            })
            .eq(
                'id',
                messageId
            )
            .is(
                'read_at',
                null
            );

        if (error) {
            console.error(
                '[ChatPersistence] markRead failed:',
                error
            );
        }
    }

    /*
     * ----------------------------------------------------------
     * EXPIRED MESSAGES
     * ----------------------------------------------------------
     */

    async purgeExpiredMessages() {
        if (!this.roomId) {
            return 0;
        }

        const {
            data,
            error
        } = await supabase.rpc(
            'purge_expired_chat_messages',
            {
                p_room_id:
                    this.roomId
            }
        );

        if (error) {
            throw error;
        }

        return Number(data) || 0;
    }

    /*
     * ----------------------------------------------------------
     * REALTIME
     * ----------------------------------------------------------
     */

    subscribeToMessages(onMessage) {
        if (!this.roomId) {
            throw new Error(
                'Chat room has not been initialized'
            );
        }

        this.unsubscribe();

        this.channel =
            supabase
                .channel(
                    `chat-room-${this.roomId}`
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'chat_messages',
                        filter:
                            `room_id=eq.${this.roomId}`
                    },
                    (payload) => {
                        onMessage?.(
                            payload.new
                        );
                    }
                )
                .subscribe(
                    (status) => {
                        console.log(
                            '[Supabase] Realtime:',
                            status
                        );
                    }
                );

        return this.channel;
    }

    unsubscribe() {
        if (!this.channel) {
            return;
        }

        supabase.removeChannel(
            this.channel
        );

        this.channel = null;
    }

    /*
     * ----------------------------------------------------------
     * LAST SEEN
     * ----------------------------------------------------------
     */

    async updateLastSeen() {
        if (
            !this.roomId ||
            !this.user
        ) {
            return;
        }

        const {
            error
        } = await supabase
            .from(
                'chat_room_members'
            )
            .update({
                last_seen_at:
                    new Date().toISOString()
            })
            .eq(
                'room_id',
                this.roomId
            )
            .eq(
                'user_id',
                this.user.id
            );

        if (error) {
            console.error(
                '[ChatPersistence] last_seen update failed:',
                error
            );
        }
    }

    /*
     * ----------------------------------------------------------
     * CLEANUP
     * ----------------------------------------------------------
     */

    cleanup() {
        this.unsubscribe();

        this.user = null;
        this.roomId = null;
    }
}

export const chatPersistence =
    new ChatPersistence();