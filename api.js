import { supabase } from './supabase-client.js';
import { state } from './state.js';

// Layer to handle all Database/API calls
export const api = {
    async login(email, password) {
        if (state.isMockMode) return this.mockLogin(email);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.user;
    },

    async signUp(email, password, username) {
        if (state.isMockMode) return this.mockSignUp(email, username);
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { username } }
        });
        if (error) throw error;
        return data.user;
    },

    async fetchProfile(userId) {
        if (state.isMockMode) return this.mockGetProfile(userId);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    async fetchFriendships() {
        if (state.isMockMode) return this.mockGetFriendships();
        const { data, error } = await supabase
            .from('friendships')
            .select('*, requester:profiles!requester_id(*), receiver:profiles!receiver_id(*)')
            .or(`requester_id.eq.${state.currentUser.id},receiver_id.eq.${state.currentUser.id}`);
        if (error) throw error;
        return data;
    },

    async sendFriendRequest(email) {
        if (state.isMockMode) return this.mockSendRequest(email);
        const { data: target, error: uErr } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single();
        if (uErr || !target) throw new Error('المستخدم غير موجود.');

        const { error } = await supabase
            .from('friendships')
            .insert([{ requester_id: state.currentUser.id, receiver_id: target.id, status: 'pending' }]);
        if (error) throw error;
    },

    async acceptFriend(friendshipId) {
        if (state.isMockMode) return this.mockAcceptFriend(friendshipId);
        const { error } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', friendshipId);
        if (error) throw error;
    },

    async getOrCreateConversation(partnerId) {
        if (state.isMockMode) return this.mockGetOrCreateConv(partnerId);
        const { data, error } = await supabase.rpc('get_or_create_conversation', { partner_id: partnerId });
        if (error) throw error;
        return data;
    },

    async fetchMessages(convId) {
        if (state.isMockMode) return this.mockGetMessages(convId);
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    async sendMessage(convId, content) {
        if (state.isMockMode) return this.mockSendMessage(convId, content);
        const { error } = await supabase
            .from('messages')
            .insert([{ conversation_id: convId, sender_id: state.currentUser.id, content }]);
        if (error) throw error;
    },

    // ==========================================
    // MOCK DATA FALLBACKS (Local Storage)
    // ==========================================
    mockLogin(email) {
        let users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        let user = users.find(u => u.email === email);
        if (!user) throw new Error('المستخدم غير مسجل بالبريد الإلكتروني المدخل.');
        return user;
    },

    mockSignUp(email, username) {
        let users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        if (users.some(u => u.email === email)) throw new Error('البريد الإلكتروني مسجل بالفعل.');
        let newUser = { id: 'u_' + Date.now(), email, username, avatar_url: '👤', status: 'online' };
        users.push(newUser);
        localStorage.setItem('mock_users', JSON.stringify(users));
        return newUser;
    },

    mockGetProfile(userId) {
        let users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        return users.find(u => u.id === userId) || null;
    },

    mockGetFriendships() {
        return JSON.parse(localStorage.getItem('mock_friendships') || '[]');
    },

    mockSendRequest(email) {
        let users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        let target = users.find(u => u.email === email);
        if (!target) throw new Error('المستخدم غير موجود.');

        let friendships = JSON.parse(localStorage.getItem('mock_friendships') || '[]');
        friendships.push({
            id: 'f_' + Date.now(),
            requester_id: state.currentUser.id,
            receiver_id: target.id,
            status: 'pending',
            requester: state.currentUser,
            receiver: target
        });
        localStorage.setItem('mock_friendships', JSON.stringify(friendships));
    },

    mockAcceptFriend(friendshipId) {
        let friendships = JSON.parse(localStorage.getItem('mock_friendships') || '[]');
        let f = friendships.find(item => item.id === friendshipId);
        if (f) f.status = 'accepted';
        localStorage.setItem('mock_friendships', JSON.stringify(friendships));
    },

    mockGetOrCreateConv(partnerId) {
        let convs = JSON.parse(localStorage.getItem('mock_conversations') || '[]');
        let members = JSON.parse(localStorage.getItem('mock_members') || '[]');

        let myConvs = members.filter(m => m.user_id === state.currentUser.id).map(m => m.conversation_id);
        let shared = members.find(m => m.user_id === partnerId && myConvs.includes(m.conversation_id));

        if (shared) return shared.conversation_id;

        let newId = 'c_' + Date.now();
        convs.push({ id: newId, is_group: false });
        members.push({ conversation_id: newId, user_id: state.currentUser.id });
        members.push({ conversation_id: newId, user_id: partnerId });

        localStorage.setItem('mock_conversations', JSON.stringify(convs));
        localStorage.setItem('mock_members', JSON.stringify(members));
        return newId;
    },

    mockGetMessages(convId) {
        let messages = JSON.parse(localStorage.getItem('mock_messages') || '[]');
        return messages.filter(m => m.conversation_id === convId);
    },

    mockSendMessage(convId, content) {
        let messages = JSON.parse(localStorage.getItem('mock_messages') || '[]');
        messages.push({
            id: 'm_' + Date.now(),
            conversation_id: convId,
            sender_id: state.currentUser.id,
            content,
            created_at: new Date().toISOString()
        });
        localStorage.setItem('mock_messages', JSON.stringify(messages));
    }
};