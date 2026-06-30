import { state } from './state.js';

// UI Layer - Handles DOM updates and layout transitions
export const ui = {
    showLoading(elementId) {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 space-y-3 animate-pulse">
                    <div class="w-10 h-10 rounded-full border-4 border-teal-500 border-t-transparent animate-spin"></div>
                    <p class="text-xs text-slate-400">جاري جلب البيانات المشفرة...</p>
                </div>
            `;
        }
    },

    renderFriends(friends, activeId, onSelect) {
        const container = document.getElementById('friends-list');
        if (!container) return;

        if (friends.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-slate-500 text-xs">
                    <i class="fa-regular fa-face-frown text-3xl mb-2 block"></i>
                    لا يوجد أصدقاء مضافين بعد.
                </div>
            `;
            return;
        }

        container.innerHTML = friends.map(friend => `
            <div data-id="${friend.id}" class="flex items-center justify-between p-3 rounded-xl cursor-pointer transition border ${activeId === friend.id ? 'bg-brand-600/30 border-brand-500/30' : 'hover:bg-slate-800/40 border-transparent'}">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-lg border border-slate-700">
                        ${friend.avatar_url || '👤'}
                    </div>
                    <div>
                        <h4 class="font-bold text-white text-xs">${friend.username || friend.email}</h4>
                        <p class="text-[10px] ${friend.status === 'online' ? 'text-emerald-400' : 'text-slate-500'}">
                            ${friend.status === 'online' ? 'متصل الآن' : 'غير متصل'}
                        </p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-left text-slate-500 text-xs"></i>
            </div>
        `).join('');

        // Bind click events
        container.querySelectorAll('[data-id]').forEach(el => {
            el.addEventListener('click', () => onSelect(el.getAttribute('data-id')));
        });
    },

    renderRequests(requests, onAccept) {
        const container = document.getElementById('requests-list');
        if (!container) return;

        if (requests.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-slate-500 text-xs">لا توجد طلبات صداقة معلقة.</div>`;
            return;
        }

        container.innerHTML = requests.map(req => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-700/50">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm">
                        ${req.sender.avatar_url || '👤'}
                    </div>
                    <div>
                        <h4 class="font-bold text-white text-xs">${req.sender.username}</h4>
                        <p class="text-[9px] text-slate-400">يريد إضافتك</p>
                    </div>
                </div>
                <button data-accept="${req.friendshipId}" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-semibold transition">
                    قبول
                </button>
            </div>
        `).join('');

        container.querySelectorAll('[data-accept]').forEach(btn => {
            btn.addEventListener('click', () => onAccept(btn.getAttribute('data-accept')));
        });
    },

    renderMessages(messages, currentUserId) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        if (messages.length === 0) {
            container.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-center text-slate-500">
                    <i class="fa-regular fa-comment-dots text-4xl mb-2 text-slate-600"></i>
                    <p class="text-xs">لا توجد رسائل سابقة. ابدأ المحادثة الآن!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = messages.map(msg => {
            const isMe = msg.sender_id === currentUserId;
            const time = new Date(msg.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="flex ${isMe ? 'justify-start' : 'justify-end'}">
                    <div class="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-md ${isMe ? 'bg-gradient-to-tr from-brand-600 to-teal-500 text-white rounded-br-none' : 'bg-slate-800 text-slate-100 rounded-bl-none'}">
                        <p>${msg.content}</p>
                        <span class="block text-[9px] text-right mt-1 opacity-60">${time}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    },

    toggleMobileView(view) {
        if (view === 'sidebar') {
            document.body.classList.remove('sidebar-hidden');
            document.body.classList.add('chat-hidden');
            document.getElementById('show-sidebar-btn').className = "flex-1 bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2";
            document.getElementById('show-chat-btn').className = "flex-1 bg-slate-800 text-slate-400 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2";
            document.getElementById('sidebar-wrapper').classList.remove('hidden');
            document.getElementById('chat-window-wrapper').classList.add('hidden');
        } else {
            document.body.classList.remove('chat-hidden');
            document.body.classList.add('sidebar-hidden');
            document.getElementById('show-chat-btn').className = "flex-1 bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2";
            document.getElementById('show-sidebar-btn').className = "flex-1 bg-slate-800 text-slate-400 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2";
            document.getElementById('sidebar-wrapper').classList.add('hidden');
            document.getElementById('chat-window-wrapper').classList.remove('hidden');
        }
    }
};