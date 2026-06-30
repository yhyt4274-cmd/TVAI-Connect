import { state, updateState } from './state.js';
import { api } from './api.js';
import { ui } from './ui.js';
import { supabase } from './supabase-client.js';

// Main Controller orchestrating UI and Data Layers
class App {
    constructor() {
        this.initEventListeners();
        this.initThreeBackground();
        this.checkSession();
    }

    initEventListeners() {
        // Auth Toggle
        document.getElementById('toggle-auth-btn').addEventListener('click', () => {
            const isLogin = document.getElementById('auth-title').innerText === 'تسجيل الدخول';
            if (isLogin) {
                document.getElementById('auth-title').innerText = 'إنشاء حساب جديد';
                document.getElementById('username-field').classList.remove('hidden');
                document.getElementById('auth-submit-btn').innerText = 'تسجيل حساب جديد';
                document.getElementById('toggle-auth-btn').innerText = 'لديك حساب بالفعل؟ سجل دخولك';
            } else {
                document.getElementById('auth-title').innerText = 'تسجيل الدخول';
                document.getElementById('username-field').classList.add('hidden');
                document.getElementById('auth-submit-btn').innerText = 'دخول آمن';
                document.getElementById('toggle-auth-btn').innerText = 'ليس لديك حساب؟ سجل الآن';
            }
        });

        // Auth Submit
        document.getElementById('auth-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            const username = document.getElementById('auth-username').value.trim();
            const isSignUp = !document.getElementById('username-field').classList.contains('hidden');

            try {
                let user;
                if (isSignUp) {
                    user = await api.signUp(email, password, username);
                    Swal.fire({ icon: 'success', title: 'تم التسجيل!', text: 'يمكنك الآن تسجيل الدخول.' });
                } else {
                    user = await api.login(email, password);
                    const profile = await api.fetchProfile(user.id);
                    updateState('currentUser', profile);
                    this.onLoginSuccess();
                }
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'فشل العملية', text: err.message });
            }
        });

        // Add Friend
        document.getElementById('add-friend-btn').addEventListener('click', async () => {
            const emailInput = document.getElementById('friend-email-input');
            const email = emailInput.value.trim();
            if (!email) return;

            try {
                await api.sendFriendRequest(email);
                Swal.fire({ icon: 'success', title: 'تم إرسال الطلب بنجاح!' });
                emailInput.value = '';
                this.loadDashboardData();
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'فشل إرسال الطلب', text: err.message });
            }
        });

        // Send Message
        document.getElementById('chat-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('message-input');
            const content = input.value.trim();
            if (!content || !state.activeConversationId) return;

            try {
                await api.sendMessage(state.activeConversationId, content);
                input.value = '';
                this.loadMessages();
            } catch (err) {
                console.error(err);
            }
        });

        // Tabs
        document.getElementById('tab-friends').addEventListener('click', () => this.switchTab('friends'));
        document.getElementById('tab-requests').addEventListener('click', () => this.switchTab('requests'));

        // Mobile Toggles
        document.getElementById('show-sidebar-btn').addEventListener('click', () => ui.toggleMobileView('sidebar'));
        document.getElementById('show-chat-btn').addEventListener('click', () => ui.toggleMobileView('chat'));
    }

    async checkSession() {
        if (!state.isMockMode && supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const profile = await api.fetchProfile(session.user.id);
                updateState('currentUser', profile);
                this.onLoginSuccess();
            }
        }
    }

    onLoginSuccess() {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');
        
        // Navigation user profile
        document.getElementById('nav-user-area').innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-xs text-teal-400 font-bold hidden md:inline">متصل 🛡️</span>
                <div class="w-10 h-10 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-lg">
                    ${state.currentUser.avatar_url || '👤'}
                </div>
                <button id="logout-btn" class="text-slate-400 hover:text-red-400 transition p-1"><i class="fa-solid fa-right-from-bracket"></i></button>
            </div>
        `;

        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        this.loadDashboardData();
        if (!state.isMockMode) this.setupRealtime();
    }

    async logout() {
        if (!state.isMockMode && supabase) {
            await supabase.auth.signOut();
        }
        window.location.reload();
    }

    async switchTab(tab) {
        updateState('currentTab', tab);
        const tf = document.getElementById('tab-friends');
        const tr = document.getElementById('tab-requests');
        if (tab === 'friends') {
            tf.className = "flex-1 py-1 text-xs font-bold text-center border-b-2 border-teal-500 text-teal-400";
            tr.className = "flex-1 py-1 text-xs font-bold text-center text-slate-400";
            document.getElementById('friends-list').classList.remove('hidden');
            document.getElementById('requests-list').classList.add('hidden');
        } else {
            tr.className = "flex-1 py-1 text-xs font-bold text-center border-b-2 border-teal-500 text-teal-400";
            tf.className = "flex-1 py-1 text-xs font-bold text-center text-slate-400";
            document.getElementById('requests-list').classList.remove('hidden');
            document.getElementById('friends-list').classList.add('hidden');
        }
        this.loadDashboardData();
    }

    async loadDashboardData() {
        ui.showLoading('friends-list');
        ui.showLoading('requests-list');

        try {
            const friendships = await api.fetchFriendships();
            const friends = [];
            const requests = [];

            friendships.forEach(f => {
                if (f.status === 'accepted') {
                    friends.push(f.requester_id === state.currentUser.id ? f.receiver : f.requester);
                } else if (f.status === 'pending' && f.receiver_id === state.currentUser.id) {
                    requests.push({ friendshipId: f.id, sender: f.requester });
                }
            });

            updateState('friends', friends);
            updateState('requests', requests);

            document.getElementById('friends-count').innerText = friends.length;
            document.getElementById('requests-count').innerText = requests.length;

            ui.renderFriends(friends, state.activeChatFriend?.id, (id) => this.selectChat(id));
            ui.renderRequests(requests, (id) => this.acceptRequest(id));
        } catch (err) {
            console.error(err);
        }
    }

    async selectChat(friendId) {
        try {
            const friend = await api.fetchProfile(friendId);
            updateState('activeChatFriend', friend);

            document.getElementById('chat-partner-name').innerText = friend.username;
            document.getElementById('chat-partner-status').innerText = friend.status === 'online' ? 'نشط الآن' : 'غير متصل';
            document.getElementById('chat-avatar').innerText = friend.avatar_url || '👤';

            const convId = await api.getOrCreateConversation(friendId);
            updateState('activeConversationId', convId);

            document.getElementById('message-input').disabled = false;
            document.getElementById('send-btn').disabled = false;

            this.loadMessages();

            if (window.innerWidth < 1024) {
                ui.toggleMobileView('chat');
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'خطأ', text: 'فشل تحميل المحادثة.' });
        }
    }

    async loadMessages() {
        if (!state.activeConversationId) return;
        try {
            const messages = await api.fetchMessages(state.activeConversationId);
            updateState('messages', messages);
            ui.renderMessages(messages, state.currentUser.id);
        } catch (err) {
            console.error(err);
        }
    }

    async acceptRequest(friendshipId) {
        try {
            await api.acceptFriend(friendshipId);
            Swal.fire({ icon: 'success', title: 'تم قبول الصداقة!' });
            this.loadDashboardData();
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'خطأ', text: err.message });
        }
    }

    setupRealtime() {
        supabase
            .channel('db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
                if (payload.new && payload.new.conversation_id === state.activeConversationId) {
                    this.loadMessages();
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
                this.loadDashboardData();
            })
            .subscribe();
    }

    initThreeBackground() {
        const container = document.getElementById('canvas-container');
        if (!container) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(renderer.domElement);

        const geom = new THREE.BufferGeometry();
        const count = 60;
        const pos = new Float32Array(count * 3);
        for(let i=0; i<count*3; i++) pos[i] = (Math.random() - 0.5) * 40;
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

        const mat = new THREE.PointsMaterial({ color: 0x14b8a6, size: 0.25, transparent: true, opacity: 0.8 });
        const points = new THREE.Points(geom, mat);
        scene.add(points);
        camera.position.z = 20;

        const animate = () => {
            requestAnimationFrame(animate);
            points.rotation.y += 0.001;
            renderer.render(scene, camera);
        };
        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
}

new App();