// app.js
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDJH9fNA-HspYQ8GDD6TC8IbBCw4X9QR88",
    authDomain: "new-look-8d456.firebaseapp.com",
    projectId: "new-look-8d456",
    storageBucket: "new-look-8d456.firebasestorage.app",
    messagingSenderId: "205405975261",
    appId: "1:205405975261:web:b7213c8e4dd6217f0ba134",
    measurementId: "G-FM9PRT9BKZ"
};

// Initialize Firebase with better error handling
try {
    if (!firebase.apps?.length) {
        const app = firebase.initializeApp(firebaseConfig);
        if (firebase.analytics) {
            firebase.analytics(app);
        }
        console.log('Firebase initialized successfully');
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Replace initializeUserStatus with Firestore-only version
function initializeUserStatus(userId) {
    const userStatusRef = db.collection('users').doc(userId);

    // Create presence tracking
    const updateUserStatus = async (status) => {
        try {
            await userStatusRef.update({
                status: status,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating user status:', error);
        }
    };

    // Update on connect/disconnect using onSnapshot
    db.collection('users').doc(userId).onSnapshot((doc) => {
        if (doc.exists && auth.currentUser) {
            updateUserStatus('online');
        }
    });

    // Update status on page visibility change
    document.addEventListener('visibilitychange', () => {
        if (auth.currentUser) {
            updateUserStatus(document.visibilityState === 'visible' ? 'online' : 'away');
        }
    });

    // Update status before page unload
    window.addEventListener('beforeunload', () => {
        if (auth.currentUser) {
            updateUserStatus('offline');
        }
    });
}

// Global variables
let currentUser = null;
let currentChat = null;
let typingTimeout = null;

// Add message listener cleanup
let currentMessageListener = null;

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
    const email = document.getElementById('login-email').value.trim();
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
        let errorMessage = 'Login failed. Please try again.';
        
        switch (error.code) {
            case 'auth/invalid-credential':
                errorMessage = 'Invalid email or password';
                break;
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email format';
                break;
        }
        
        alert(errorMessage);
    }
}

// Update logout function to use only Firestore
async function logout() {
    try {
        if (currentUser) {
            // Clean up listeners
            if (currentMessageListener) {
                currentMessageListener();
                currentMessageListener = null;
            }

            // Update status before signing out
            await db.collection('users').doc(currentUser.uid).update({
                status: 'offline',
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });

            await auth.signOut();
            console.log('Logged out successfully');
        }
    } catch (error) {
        console.error('Error during logout:', error);
        alert('Error logging out. Please try again.');
    }
}

// Chat functions
// Update sendMessage function to handle user-to-user messaging
// Update sendMessage function with duplicate prevention
async function sendMessage() {
    if (!currentChat) {
        alert('Please select a chat first');
        return;
    }

    const messageText = document.getElementById('message-text').value.trim();
    if (!messageText) return;

    // Disable send button
    const sendButton = document.querySelector('.message-input button');
    sendButton.disabled = true;

    try {
        const message = {
            text: messageText,
            senderId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            read: false,
            messageId: `${currentUser.uid}_${Date.now()}` // Add unique message ID
        };

        const chatRef = db.collection('chats').doc(currentChat.id);
        
        // Check for duplicate message
        const recentMessages = await chatRef.collection('messages')
            .where('messageId', '==', message.messageId)
            .get();

        if (recentMessages.empty) {
            await chatRef.collection('messages').add(message);
            await chatRef.update({
                lastMessage: {
                    text: messageText,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
        }

        document.getElementById('message-text').value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    } finally {
        sendButton.disabled = false;
    }
}

// Add file handling functions
// Update file handling function
async function handleFileUpload(file) {
    if (!currentChat) {
        alert('Please select a chat first');
        return;
    }

    // Show loading indicator
    const messageInput = document.getElementById('message-text');
    messageInput.placeholder = 'Uploading file...';
    messageInput.disabled = true;

    try {
        // Validate file size
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            throw new Error('File size must be less than 5MB');
        }

        // Create unique filename
        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`chats/${currentChat.id}/${fileName}`);

        // Set correct metadata
        const metadata = {
            contentType: file.type,
            customMetadata: {
                uploadedBy: currentUser.uid,
                uploadedAt: new Date().toISOString()
            }
        };

        // Upload file
        const uploadTask = fileRef.put(file, metadata);

        uploadTask.on('state_changed',
            // Progress
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                messageInput.placeholder = `Uploading: ${Math.round(progress)}%`;
            },
            // Error
            (error) => {
                console.error('Upload error:', error);
                alert('Failed to upload file: ' + error.message);
                messageInput.placeholder = 'Type a message';
                messageInput.disabled = false;
            },
            // Complete
            async () => {
                try {
                    const downloadURL = await fileRef.getDownloadURL();

                    // Create message with file
                    const message = {
                        senderId: currentUser.uid,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        fileUrl: downloadURL,
                        fileName: file.name,
                        fileType: file.type.split('/')[0],
                        fileSize: file.size,
                        read: false
                    };

                    // Add message to chat
                    await db.collection('chats')
                        .doc(currentChat.id)
                        .collection('messages')
                        .add(message);

                    // Update chat's last message
                    await db.collection('chats')
                        .doc(currentChat.id)
                        .update({
                            lastMessage: {
                                text: `Shared a ${file.type.split('/')[0]} file`,
                                timestamp: firebase.firestore.FieldValue.serverTimestamp()
                            }
                        });

                    messageInput.placeholder = 'Type a message';
                    messageInput.disabled = false;
                } catch (error) {
                    console.error('Error creating message:', error);
                    alert('Failed to create message');
                    messageInput.placeholder = 'Type a message';
                    messageInput.disabled = false;
                }
            }
        );
    } catch (error) {
        console.error('Error handling file:', error);
        alert(error.message);
        messageInput.placeholder = 'Type a message';
        messageInput.disabled = false;
    }
}

// Update loadMessages function to show sender names and handle files and message options
// Update loadMessages function with cleanup and deduplication
function loadMessages(chatId) {
    if (!chatId) return;

    // Cleanup existing listener
    if (currentMessageListener) {
        currentMessageListener();
    }

    // Set new listener
    currentMessageListener = db.collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp')
        .onSnapshot(async snapshot => {
            const messages = document.getElementById('messages');
            messages.innerHTML = '';
            
            const processedMessages = new Set(); // Track processed messages

            for (const doc of snapshot.docs) {
                // Skip if message already processed
                if (processedMessages.has(doc.id)) continue;
                processedMessages.add(doc.id);

                const message = doc.data();
                const messageElement = document.createElement('div');
                messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                
                // Get sender's name
                const senderDoc = await db.collection('users').doc(message.senderId).get();
                const senderName = senderDoc.data()?.name || 'Unknown User';

                let messageContent = '';
                if (message.fileUrl) {
                    switch(message.fileType) {
                        case 'image':
                            messageContent = `<img src="${message.fileUrl}" alt="${message.fileName}" class="message-image">`;
                            break;
                        case 'audio':
                            messageContent = `<audio controls src="${message.fileUrl}" class="message-audio"></audio>`;
                            break;
                        case 'video':
                            messageContent = `<video controls src="${message.fileUrl}" class="message-video"></video>`;
                            break;
                        default:
                            messageContent = `<a href="${message.fileUrl}" target="_blank" class="message-file">${message.fileName}</a>`;
                    }
                } else {
                    messageContent = `<span class="message-text">${message.text}</span>`;
                }

                messageElement.innerHTML = `
                    <div class="message-content">
                        <span class="message-sender">${message.senderId === currentUser.uid ? 'You' : senderName}</span>
                        ${messageContent}
                        <span class="message-time">${message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString() : ''}</span>
                        <div class="message-options">
                            <button onclick="copyMessage('${message.text || message.fileUrl}')" title="Copy">📋</button>
                            ${message.senderId === currentUser.uid ? `
                                <button onclick="editMessage('${doc.id}', '${message.text || ''}')" title="Edit">✏️</button>
                                <button onclick="deleteMessage('${doc.id}')" title="Delete">🗑️</button>
                            ` : ''}
                        </div>
                    </div>
                `;
                messages.appendChild(messageElement);
            }
            
            messages.scrollTop = messages.scrollHeight;
        });

    return currentMessageListener;
}

// Add message manipulation functions
function copyMessage(content) {
    navigator.clipboard.writeText(content).then(() => {
        alert('Message copied to clipboard');
    });
}

async function editMessage(messageId, currentText) {
    const newText = prompt('Edit message:', currentText);
    if (newText && newText !== currentText) {
        try {
            await db.collection('chats')
                .doc(currentChat.id)
                .collection('messages')
                .doc(messageId)
                .update({
                    text: newText,
                    edited: true
                });
        } catch (error) {
            console.error('Error editing message:', error);
        }
    }
}

async function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        try {
            await db.collection('chats')
                .doc(currentChat.id)
                .collection('messages')
                .doc(messageId)
                .delete();
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }
}

// Theme functions
function toggleTheme() {
    const theme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// Typing indicator
// Update typing indicator to use Firestore
function handleTyping() {
    if (!currentChat) return;

    clearTimeout(typingTimeout);
    
    const typingRef = db.collection('chats').doc(currentChat.id);
    typingRef.update({
        [`typing.${currentUser.uid}`]: true
    });

    typingTimeout = setTimeout(() => {
        typingRef.update({
            [`typing.${currentUser.uid}`]: false
        });
    }, 1000);
}

// Update auth state observer
auth.onAuthStateChanged(async user => {
    try {
        if (user) {
            currentUser = user;
            initializeUserStatus(user.uid);
            
            document.getElementById('auth-section').classList.add('hidden');
            document.getElementById('chat-section').classList.remove('hidden');
            await loadUserProfile();
            loadChats();
        } else {
            // Clear current user and chat
            currentUser = null;
            currentChat = null;

            // Clean up UI
            document.getElementById('auth-section').classList.remove('hidden');
            document.getElementById('chat-section').classList.add('hidden');
            document.getElementById('messages').innerHTML = '';
            document.getElementById('chat-list').innerHTML = '';
        }
    } catch (error) {
        console.error('Error in auth state change:', error);
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
        document.getElementById('user-avatar').src = userData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}`;
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

// Add profile management functions
function toggleProfileModal() {
    const profileModal = document.getElementById('profile-modal');
    profileModal.classList.toggle('hidden');
    
    if (!profileModal.classList.contains('hidden')) {
        // Load current user data into form
        db.collection('users').doc(currentUser.uid).get().then(doc => {
            const userData = doc.data();
            document.getElementById('profile-name').value = userData.name || '';
            document.getElementById('profile-email').value = currentUser.email || '';
        });
    }
}

async function updateProfile() {
    const newName = document.getElementById('profile-name').value.trim();
    const newEmail = document.getElementById('profile-email').value.trim();
    const newPassword = document.getElementById('profile-password').value.trim();
    const profilePhoto = document.getElementById('profile-photo').files[0];

    try {
        const updates = {};
        let photoURL = null;

        // Update profile photo if provided
        if (profilePhoto) {
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (profilePhoto.size > maxSize) {
                throw new Error('Profile photo must be less than 5MB');
            }

            const fileName = `profile_${currentUser.uid}_${Date.now()}.${profilePhoto.name.split('.').pop()}`;
            const photoRef = storage.ref().child(`profiles/${fileName}`);
            
            await photoRef.put(profilePhoto);
            photoURL = await photoRef.getDownloadURL();
            updates.photoURL = photoURL;
        }

        // Update name if changed
        if (newName && newName !== currentUser.displayName) {
            updates.name = newName;
        }

        // Update email if changed
        if (newEmail && newEmail !== currentUser.email) {
            await currentUser.updateEmail(newEmail);
        }

        // Update password if provided
        if (newPassword) {
            await currentUser.updatePassword(newPassword);
        }

        // Update Firestore user document
        if (Object.keys(updates).length > 0) {
            await db.collection('users').doc(currentUser.uid).update(updates);
        }

        // Update profile photo in Firebase Auth if available
        if (photoURL) {
            await currentUser.updateProfile({
                photoURL: photoURL
            });
        }

        await loadUserProfile();
        toggleProfileModal();
        alert('Profile updated successfully');
    } catch (error) {
        console.error('Error updating profile:', error);
        alert(`Error updating profile: ${error.message}`);
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

// Update the createNewChat function to check for existing chats
async function createNewChat(otherUserId) {
    try {
        // Check if chat already exists
        const existingChat = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .where('participants', '==', [currentUser.uid, otherUserId].sort())
            .get();

        if (!existingChat.empty) {
            return existingChat.docs[0].id;
        }

        // Create new chat if none exists
        const chatRef = await db.collection('chats').add({
            participants: [currentUser.uid, otherUserId].sort(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessage: null
        });
        
        return chatRef.id;
    } catch (error) {
        console.error('Error creating chat:', error);
        return null;
    }
}

// Add function to load available users
// Update loadAvailableUsers function to prevent duplicates
async function loadAvailableUsers() {
    try {
        // Clear existing users list
        const chatList = document.getElementById('chat-list');
        const existingUsersList = chatList.querySelector('.users-list');
        if (existingUsersList) {
            existingUsersList.remove();
        }

        const usersSnapshot = await db.collection('users')
            .where(firebase.firestore.FieldPath.documentId(), '!=', currentUser.uid)
            .get();
        
        const usersList = document.createElement('div');
        usersList.className = 'users-list';
        
        // Add a close button
        const closeButton = document.createElement('button');
        closeButton.className = 'close-users-list';
        closeButton.innerHTML = '✕';
        closeButton.onclick = () => usersList.remove();
        usersList.appendChild(closeButton);
        
        const usersMap = new Map(); // To prevent duplicate users
        
        usersSnapshot.forEach(doc => {
            if (!usersMap.has(doc.id)) {
                const userData = doc.data();
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                userItem.innerHTML = `
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}" alt="${userData.name}">
                    <div class="user-item-info">
                        <span class="user-item-name">${userData.name}</span>
                        <span class="user-item-email">${userData.email}</span>
                    </div>
                `;
                userItem.onclick = async () => {
                    const chatId = await createNewChat(doc.id);
                    if (chatId) {
                        usersList.remove();
                        loadMessages(chatId);
                    }
                };
                usersList.appendChild(userItem);
                usersMap.set(doc.id, true);
            }
        });
        
        chatList.insertBefore(usersList, chatList.firstChild.nextSibling);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Update loadChats function to use Firestore for status
async function loadChats() {
    if (!currentUser) return;
    
    try {
        const chatList = document.getElementById('chat-list');
        chatList.innerHTML = '<button onclick="loadAvailableUsers()" class="new-chat-btn">New Chat</button>';
        
        // Listen to chats collection
        db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .onSnapshot(snapshot => {
                const existingChats = document.createElement('div');
                existingChats.className = 'existing-chats';
                
                snapshot.forEach(async doc => {
                    const chat = doc.data();
                    const otherUserId = chat.participants.find(id => id !== currentUser.uid);
                    
                    // Get other user's details with real-time status updates
                    db.collection('users').doc(otherUserId).onSnapshot(userDoc => {
                        const otherUserData = userDoc.data();
                        
                        const div = document.createElement('div');
                        div.className = 'chat-item';
                        div.innerHTML = `
                            <div class="chat-info">
                                <div class="chat-name">
                                    ${otherUserData.name}
                                    <span class="user-status ${otherUserData.status || 'offline'}">
                                        ${otherUserData.status === 'online' ? '●' : '○'}
                                    </span>
                                </div>
                                <div class="chat-last-message">
                                    ${otherUserData.status === 'offline' && otherUserData.lastSeen ? 
                                    `Last seen ${formatLastSeen(otherUserData.lastSeen.toDate())}` : 
                                    otherUserData.status === 'online' ? 'Online' : 'Offline'}
                                </div>
                            </div>
                        `;
                        
                        div.onclick = () => {
                            currentChat = { id: doc.id, ...chat };
                            loadMessages(doc.id);
                            document.getElementById('current-chat-name').textContent = otherUserData.name;
                        };
                        
                        // Update or add chat item
                        const existingDiv = existingChats.querySelector(`[data-chat-id="${doc.id}"]`);
                        if (existingDiv) {
                            existingDiv.replaceWith(div);
                        } else {
                            div.setAttribute('data-chat-id', doc.id);
                            existingChats.appendChild(div);
                        }
                    });
                });
                
                // Replace existing chats list
                const oldChats = chatList.querySelector('.existing-chats');
                if (oldChats) {
                    oldChats.replaceWith(existingChats);
                } else {
                    chatList.appendChild(existingChats);
                }
            });
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

// Add helper function for formatting last seen
function formatLastSeen(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)} hours ago`;
    return date.toLocaleDateString();
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Set theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);

    // Add typing event listener
    document.getElementById('message-text').addEventListener('input', handleTyping);

    // Update file input handler
    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });

    // Add profile modal close handler
    document.querySelector('.close-profile-modal')?.addEventListener('click', toggleProfileModal);

    // Preview profile photo before upload
    document.getElementById('profile-photo')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('profile-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
});