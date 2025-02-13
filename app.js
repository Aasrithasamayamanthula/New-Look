// app.js
// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDJH9fNA-HspYQ8GDD6TC8IbBCw4X9QR88",
    authDomain: "new-look-8d456.firebaseapp.com",
    projectId: "new-look-8d456",
    storageBucket: "new-look-8d456.firebasestorage.app",
    messagingSenderId: "205405975261",
    appId: "1:205405975261:web:b7213c8e4dd6217f0ba134",
    measurementId: "G-FM9PRT9BKZ"
};

// Initialize Firebase with error handling
try {
    if (!firebase.apps?.length) {
        const app = firebase.initializeApp(firebaseConfig);
        if (firebase.analytics) {
            firebase.analytics(app);
        }
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Global variables
let currentUser = null;
let currentChat = null;
let typingTimeout = null;

// Auth functions
function toggleAuth() {
    document.getElementById('login-form').classList.toggle('hidden');
    document.getElementById('signup-form').classList.toggle('hidden');
}

async function signup() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCredential.user.uid).set({
            name,
            email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        alert(error.message);
    }
}

// Update login function with better error handling
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        alert('Please enter both email and password');
        return;
    }

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        console.log('Logged in successfully:', userCredential.user.email);
    } catch (error) {
        console.error('Login error:', error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            alert('Invalid email or password');
        } else if (error.code === 'auth/invalid-email') {
            alert('Invalid email format');
        } else {
            alert(error.message);
        }
    }
}

function logout() {
    auth.signOut();
}

// Chat functions
async function sendMessage() {
    if (!currentChat) return;

    const messageText = document.getElementById('message-text').value;
    if (!messageText.trim()) return;

    const message = {
        text: messageText,
        senderId: currentUser.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false
    };

    try {
        await db.collection('chats').doc(currentChat.id).collection('messages').add(message);
        document.getElementById('message-text').value = '';
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

function loadMessages(chatId) {
    return db.collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp')
        .onSnapshot(snapshot => {
            const messages = document.getElementById('messages');
            messages.innerHTML = '';
            
            snapshot.forEach(doc => {
                const message = doc.data();
                const messageElement = document.createElement('div');
                messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                messageElement.textContent = message.text;
                messages.appendChild(messageElement);
            });
            
            messages.scrollTop = messages.scrollHeight;
        });
}

// Theme functions
function toggleTheme() {
    const theme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// Typing indicator
function handleTyping() {
    if (!currentChat) return;

    clearTimeout(typingTimeout);
    
    db.collection('chats').doc(currentChat.id).update({
        [`typing.${currentUser.uid}`]: true
    });

    typingTimeout = setTimeout(() => {
        db.collection('chats').doc(currentChat.id).update({
            [`typing.${currentUser.uid}`]: false
        });
    }, 1000);
}

// Auth state observer
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('chat-section').classList.remove('hidden');
        loadUserProfile();
        loadChats();
    } else {
        currentUser = null;
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('chat-section').classList.add('hidden');
    }
});

// Update loadUserProfile function
async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data();
        
        // Update user profile information
        document.getElementById('user-name').textContent = userData.name;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-avatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}`;
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

// Update searchChats function
function searchChats() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const chatItems = document.getElementsByClassName('chat-item');
    
    Array.from(chatItems).forEach(item => {
        const chatName = item.textContent.toLowerCase();
        if (chatName.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Update loadChats function
async function loadChats() {
    if (!currentUser) return;
    
    try {
        const chatList = document.getElementById('chat-list');
        db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .onSnapshot(snapshot => {
                chatList.innerHTML = '';
                snapshot.forEach(async doc => {
                    const chat = doc.data();
                    const div = document.createElement('div');
                    div.className = 'chat-item';
                    
                    // Create chat item content
                    const chatInfo = document.createElement('div');
                    chatInfo.className = 'chat-info';
                    chatInfo.innerHTML = `
                        <div class="chat-name">${chat.name || 'Chat'}</div>
                        <div class="chat-last-message">Loading...</div>
                    `;
                    
                    div.appendChild(chatInfo);
                    div.onclick = () => {
                        currentChat = { id: doc.id, ...chat };
                        loadMessages(doc.id);
                    };
                    chatList.appendChild(div);
                    
                    // Load last message
                    const lastMessage = await db.collection('chats')
                        .doc(doc.id)
                        .collection('messages')
                        .orderBy('timestamp', 'desc')
                        .limit(1)
                        .get();
                        
                    if (!lastMessage.empty) {
                        const message = lastMessage.docs[0].data();
                        chatInfo.querySelector('.chat-last-message').textContent = message.text;
                    }
                });
            });
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Set theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);

    // Add typing event listener
    document.getElementById('message-text').addEventListener('input', handleTyping);
});