// Centralized Application State
export const state = {
    currentUser: null,
    activeChatFriend: null,
    activeConversationId: null,
    currentTab: 'friends', // 'friends' or 'requests'
    friends: [],
    requests: [],
    messages: [],
    isMockMode: typeof window.supabase === 'undefined'
};

export function updateState(key, value) {
    state[key] = value;
    // Dispatch custom event for state updates if needed
    window.dispatchEvent(new CustomEvent('stateChanged', { detail: { key, value } }));
}