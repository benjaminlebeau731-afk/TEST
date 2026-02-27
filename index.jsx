import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, Hash, Bell, Menu, X, Send, MoreVertical, Plus, UserPlus, Users, AtSign, Check, LogOut
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';

// -------------------------------------------------------------------------------------------------
// FIREBASE CONFIGURATION
// -------------------------------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBrnDaU89-6XHxzcJ7m6eChN-Z7nZslZaA",
  authDomain: "chatspace-d9d08.firebaseapp.com",
  projectId: "chatspace-d9d08",
  storageBucket: "chatspace-d9d08.firebasestorage.app",
  messagingSenderId: "715590145141",
  appId: "1:715590145141:web:f64500d465b9a9456ed43c",
  measurementId: "G-9LL24NCGQ3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const APP_NAMESPACE = "chatspace-v1"; 
// -------------------------------------------------------------------------------------------------

export default function App() {
  // Authentication / User state
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userName, setUserName] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [isJoined, setIsJoined] = useState(false);

  // App State (Synced with Firestore)
  const [knownUsers, setKnownUsers] = useState([]); 
  const [contacts, setContacts] = useState([]); 
  const [allChats, setAllChats] = useState({});
  const [allMessages, setAllMessages] = useState([]);
  
  // Local UI State
  const [activeChatId, setActiveChatId] = useState('global');
  const [activeTab, setActiveTab] = useState('channel'); 
  const [inputValue, setInputValue] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [modalType, setModalType] = useState(null); 
  const [modalInput, setModalInput] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [modalError, setModalError] = useState('');
  
  const messagesEndRef = useRef(null);

  // 1. Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setIsCheckingAuth(false);
        setIsJoined(false);
        setUserName('');
      }
    });
    return () => unsubscribe();
  }, []);

  // Check if user has a saved profile to auto-login
  useEffect(() => {
    if (!firebaseUser) return;
    
    const checkProfile = async () => {
      try {
        const profileRef = doc(db, 'artifacts', APP_NAMESPACE, 'users', firebaseUser.uid, 'profile', 'info');
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists() && profileSnap.data().username) {
          setUserName(profileSnap.data().username);
          setIsJoined(true);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    
    checkProfile();
  }, [firebaseUser]);

  // 2. Sync Chats and Messages from Firestore
  useEffect(() => {
    if (!firebaseUser || !isJoined) return;

    // Listen to Chats
    const chatsUnsub = onSnapshot(
      collection(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'chats'), 
      (snapshot) => {
        const fetchedChats = {};
        snapshot.forEach(doc => {
          fetchedChats[doc.id] = doc.data();
        });
        
        if (!fetchedChats['global']) {
          const globalChat = { id: 'global', name: 'Global Chat', type: 'channel', participants: ['All'] };
          fetchedChats['global'] = globalChat;
          setDoc(doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'chats', 'global'), globalChat);
        }
        
        setAllChats(fetchedChats);
      },
      (error) => console.error("Error fetching chats:", error)
    );

    // Listen to Messages
    const msgsUnsub = onSnapshot(
      collection(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'messages'),
      (snapshot) => {
        const msgs = [];
        snapshot.forEach(doc => {
          msgs.push({ id: doc.id, ...doc.data() });
        });
        setAllMessages(msgs);
      },
      (error) => console.error("Error fetching messages:", error)
    );

    // Listen to Users
    const usersUnsub = onSnapshot(
      collection(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'users'),
      (snapshot) => {
        const users = [];
        snapshot.forEach(doc => {
          users.push(doc.id);
        });
        setKnownUsers(users);
      },
      (error) => console.error("Error fetching users:", error)
    );

    return () => {
      chatsUnsub();
      msgsUnsub();
      usersUnsub();
    };
  }, [firebaseUser, isJoined]);

  const activeChat = allChats[activeChatId] || { id: 'global', name: 'Global Chat', type: 'channel', participants: ['All'] };
  const filteredChats = Object.values(allChats).filter(c => c.type === activeTab);
  
  const currentMessages = allMessages
    .filter(m => m.chatId === activeChatId)
    .sort((a, b) => a.createdAt - b.createdAt);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, activeChatId]);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Sign in failed", error);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const name = joinInput.trim();
    if (name !== '' && firebaseUser) {
      await setDoc(doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'users', name.toLowerCase()), {
        username: name,
        joinedAt: Date.now(),
        photoURL: firebaseUser.photoURL
      });
      
      await setDoc(doc(db, 'artifacts', APP_NAMESPACE, 'users', firebaseUser.uid, 'profile', 'info'), {
        username: name
      });

      setUserName(name);
      setIsJoined(true);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (inputValue.trim() === '' || !firebaseUser) return;
    
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const msgRef = doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'messages', msgId);
    
    await setDoc(msgRef, {
      chatId: activeChatId,
      text: inputValue,
      sender: userName,
      createdAt: Date.now(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      senderPhoto: firebaseUser.photoURL
    });
    
    setInputValue('');
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!firebaseUser) return;
    
    if (modalType === 'contact' || modalType === 'dm') {
      const contactName = modalInput.trim();
      if (contactName) {
        if (contactName.toLowerCase() === userName.toLowerCase()) {
          setModalError("You can't add yourself!");
          return;
        }
        if (!knownUsers.includes(contactName.toLowerCase())) {
          setModalError("This user does not exist!");
          return;
        }

        if (!contacts.includes(contactName)) {
          setContacts([...contacts, contactName]);
        }
        
        const existingDm = Object.values(allChats).find(
          c => c.type === 'dm' && c.name.toLowerCase() === contactName.toLowerCase()
        );
        
        if (existingDm) {
          setActiveChatId(existingDm.id);
        } else {
          const newId = `dm_${Date.now()}`;
          await setDoc(doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'chats', newId), { 
            id: newId, 
            name: contactName, 
            type: 'dm', 
            participants: [contactName] 
          });
          setActiveChatId(newId);
        }
        setActiveTab('dm');
      }
    } 
    else if (modalType === 'channel' && modalInput.trim()) {
      const newId = `chan_${Date.now()}`;
      
      await setDoc(doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'chats', newId), { 
        id: newId, 
        name: modalInput.trim(), 
        type: 'channel', 
        participants: [...selectedContacts] 
      });
      
      setActiveChatId(newId);
      setActiveTab('channel');
    }
    else if (modalType === 'invite_to_channel') {
      if (selectedContacts.length > 0) {
        const chatRef = doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'chats', activeChatId);
        const currentParticipants = activeChat.participants || [];
        const newParticipants = selectedContacts.filter(sc => 
          !currentParticipants.some(cp => cp.toLowerCase() === sc.toLowerCase())
        );
        const updatedParticipants = [...currentParticipants, ...newParticipants];
        
        await updateDoc(chatRef, { participants: updatedParticipants });
      }
    }

    closeModal();
  };

  const handleAddInvite = () => {
    const inviteName = inviteInput.trim();
    if (inviteName) {
      if (inviteName.toLowerCase() === userName.toLowerCase()) {
        setModalError("You are already in the channel!");
        return;
      }
      if (!knownUsers.includes(inviteName.toLowerCase())) {
        setModalError("This user does not exist!");
        return;
      }
      if (modalType === 'invite_to_channel' && activeChat?.participants?.some(p => p.toLowerCase() === inviteName.toLowerCase())) {
        setModalError("User is already in this channel!");
        return;
      }
      
      const alreadySelected = selectedContacts.some(c => c.toLowerCase() === inviteName.toLowerCase());
      if (!alreadySelected) {
        setSelectedContacts([...selectedContacts, inviteName]);
        setInviteInput('');
        setModalError('');
      } else {
        setModalError("User already added!");
      }
    }
  };

  const handleRemoveInvite = (contact) => {
    setSelectedContacts(selectedContacts.filter(c => c !== contact));
  };

  const openModal = (type) => {
    setModalType(type);
    setModalInput('');
    setInviteInput('');
    setSelectedContacts([]);
    setModalError('');
    setIsMobileSidebarOpen(false);
  };

  const closeModal = () => {
    setModalType(null);
    setModalInput('');
    setInviteInput('');
    setSelectedContacts([]);
    setModalError('');
  };

  const colors = {
    sidebarBg: 'bg-[#121622]',
    mainBg: 'bg-[#080b12]',
    border: 'border-[#1e2536]',
    primary: 'bg-[#635bff]',
    primaryHover: 'hover:bg-[#524be3]',
    inputBg: 'bg-[#1a2030]',
    textMuted: 'text-[#6b7280]'
  };

  if (isCheckingAuth) {
    return (
      <div className={`flex h-screen w-full items-center justify-center font-sans ${colors.mainBg}`}>
         <div className="w-10 h-10 border-4 border-[#635bff] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // LOGIN SCREEN (If not authenticated with Google)
  if (!firebaseUser) {
    return (
      <div className={`flex h-screen w-full items-center justify-center font-sans text-slate-200 ${colors.mainBg}`}>
        <div className={`w-full max-w-md p-10 rounded-2xl ${colors.sidebarBg} border ${colors.border} flex flex-col items-center mx-4 text-center`}>
          <div className={`w-16 h-16 rounded-2xl mb-8 flex items-center justify-center ${colors.primary} shadow-xl shadow-indigo-500/20`}>
            <MessageSquare size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Welcome Back</h1>
          <p className={`text-base ${colors.textMuted} mb-10`}>
            Sign in with Google to access your workspace and start chatting.
          </p>
          
          <button 
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 py-3.5 rounded-xl font-bold transition-all shadow-lg active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // PROFILE SETUP (If authenticated but no username picked yet)
  if (!isJoined) {
    return (
      <div className={`flex h-screen w-full items-center justify-center font-sans text-slate-200 ${colors.mainBg}`}>
        <div className={`w-full max-w-md p-8 rounded-2xl ${colors.sidebarBg} border ${colors.border} flex flex-col items-center mx-4`}>
          <img src={firebaseUser.photoURL} alt="User profile" className="w-20 h-20 rounded-full border-4 border-indigo-500/30 mb-6 shadow-xl" />
          <h1 className="text-2xl font-bold text-white mb-2">Set up your profile</h1>
          <p className={`text-sm ${colors.textMuted} mb-8 text-center`}>
            Hi {firebaseUser.displayName}! Choose a unique username to be identified by in the workspace.
          </p>
          
          <form onSubmit={handleJoin} className="w-full">
            <input 
              type="text" 
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Username..."
              className={`w-full ${colors.inputBg} border border-transparent focus:border-slate-600 rounded-xl px-4 py-3.5 text-slate-200 placeholder-slate-500 mb-6 focus:outline-none transition-colors`}
              autoFocus
            />
            <button 
              type="submit"
              disabled={!joinInput.trim()}
              className={`w-full py-3.5 rounded-xl font-medium text-white transition-all ${
                joinInput.trim() ? `${colors.primary} ${colors.primaryHover} shadow-md` : 'bg-[#1e2536] text-slate-500 cursor-not-allowed'
              }`}
            >
              Finish Setup
            </button>
            <button 
              type="button"
              onClick={handleLogout}
              className="w-full mt-4 text-sm text-slate-500 hover:text-white transition-colors"
            >
              Cancel and Logout
            </button>
          </form>
        </div>
      </div>
    );
  }

  // MAIN CHAT APP
  return (
    <div className={`flex h-screen w-full font-sans text-slate-200 ${colors.mainBg} overflow-hidden`}>
      {modalType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl ${colors.sidebarBg} border ${colors.border} shadow-2xl flex flex-col`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {modalType === 'contact' && 'Add New Contact'}
                {modalType === 'dm' && 'New Direct Message'}
                {modalType === 'channel' && 'Create Channel'}
                {modalType === 'invite_to_channel' && `Invite to #${activeChat?.name}`}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="flex flex-col gap-4">
              {modalError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">
                  {modalError}
                </div>
              )}

              {(modalType === 'contact' || modalType === 'dm' || modalType === 'channel') && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-slate-400 font-medium">
                    {modalType === 'contact' && 'Contact Username'}
                    {modalType === 'dm' && 'User to DM'}
                    {modalType === 'channel' && 'Channel Name'}
                  </label>
                  <input 
                    type="text" 
                    value={modalInput}
                    onChange={(e) => { setModalInput(e.target.value); setModalError(''); }}
                    placeholder={modalType === 'channel' ? 'e.g. secret-project' : '@username'}
                    className={`w-full ${colors.inputBg} border border-transparent focus:border-slate-600 rounded-xl px-4 py-3 text-slate-200 focus:outline-none`}
                    autoFocus
                  />
                </div>
              )}

              {(modalType === 'channel' || modalType === 'invite_to_channel') && (
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-sm text-slate-400 font-medium">Invite Members</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={inviteInput}
                      onChange={(e) => { setInviteInput(e.target.value); setModalError(''); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddInvite();
                        }
                      }}
                      placeholder="Type username and press Enter..."
                      className={`flex-1 ${colors.inputBg} border border-transparent focus:border-slate-600 rounded-xl px-4 py-3 text-slate-200 focus:outline-none`}
                      autoFocus={modalType === 'invite_to_channel'}
                    />
                    <button 
                      type="button"
                      onClick={handleAddInvite}
                      className={`px-4 rounded-xl font-medium text-white transition-all ${colors.primary} ${colors.primaryHover}`}
                    >
                      Add
                    </button>
                  </div>
                  
                  {selectedContacts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {selectedContacts.map(contact => (
                        <div key={contact} className="flex items-center gap-1.5 bg-[#2a344a] px-3 py-1.5 rounded-lg">
                          <span className="text-sm text-slate-200">{contact}</span>
                          <button 
                            type="button" 
                            onClick={() => handleRemoveInvite(contact)}
                            className="text-slate-400 hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button 
                type="submit"
                disabled={
                  (modalType === 'contact' && !modalInput.trim()) ||
                  (modalType === 'dm' && !modalInput.trim()) ||
                  (modalType === 'channel' && !modalInput.trim()) ||
                  (modalType === 'invite_to_channel' && selectedContacts.length === 0)
                }
                className={`w-full py-3 mt-4 rounded-xl font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${colors.primary} ${colors.primaryHover}`}
              >
                {modalType === 'contact' ? 'Add Contact' : modalType === 'invite_to_channel' ? 'Invite Members' : 'Create'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 flex flex-col ${colors.sidebarBg} border-r ${colors.border} ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`flex items-center justify-between p-4 border-b ${colors.border} h-16`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.primary}`}>
              <MessageSquare size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-wide text-white">Chat Space</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => openModal('contact')} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e2536] transition-colors" title="Add Contact">
              <UserPlus size={18} />
            </button>
            <button className="lg:hidden p-1.5 text-slate-400 hover:text-white" onClick={() => setIsMobileSidebarOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className={`flex items-center p-2 border-b ${colors.border}`}>
          <button onClick={() => setActiveTab('channel')} className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${activeTab === 'channel' ? 'bg-[#1e2536] text-white' : 'text-slate-400 hover:text-slate-300'}`}>Channels</button>
          <button onClick={() => setActiveTab('dm')} className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${activeTab === 'dm' ? 'bg-[#1e2536] text-white' : 'text-slate-400 hover:text-slate-300'}`}>DMs</button>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{activeTab === 'channel' ? 'All Channels' : 'Direct Messages'}</span>
          <button onClick={() => openModal(activeTab === 'channel' ? 'channel' : 'dm')} className="text-slate-400 hover:text-white transition-colors"><Plus size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {filteredChats.length === 0 ? (
            <div className="px-2 py-4 text-sm text-slate-500 text-center">
              No {activeTab === 'channel' ? 'channels' : 'messages'} found.<br />
              <button onClick={() => openModal(activeTab)} className="text-indigo-400 hover:underline mt-2">Create one now</button>
            </div>
          ) : (
            filteredChats.map(chat => (
              <div key={chat.id} onClick={() => { setActiveChatId(chat.id); setIsMobileSidebarOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${activeChatId === chat.id ? `${colors.primary} shadow-md` : 'hover:bg-[#1e2536]'}`}>
                <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${activeChatId === chat.id ? 'bg-white/20' : 'bg-[#1a2030]'}`}>
                  {chat.type === 'channel' ? <Hash size={16} className={activeChatId === chat.id ? 'text-white' : 'text-slate-400'} /> : <AtSign size={16} className={activeChatId === chat.id ? 'text-white' : 'text-slate-400'} />}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`font-semibold text-sm truncate ${activeChatId === chat.id ? 'text-white' : 'text-slate-300'}`}>{chat.name}</span>
                  {chat.type === 'channel' && chat.participants.length > 0 && (
                     <span className={`text-xs truncate ${activeChatId === chat.id ? 'text-indigo-200' : 'text-slate-500'}`}>{chat.participants.includes('All') ? 'Public room' : `${chat.participants.length + 1} members`}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={`p-4 border-t ${colors.border} flex flex-col gap-3 mt-auto bg-[#0f121d]`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer min-w-0">
              <img src={firebaseUser.photoURL} alt="User" className="w-9 h-9 flex-shrink-0 rounded-full border border-indigo-500/20" />
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm text-slate-200 truncate">{userName}</span>
                <span className="text-xs text-slate-500 truncate">{contacts.length} contacts</span>
              </div>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition-colors flex-shrink-0" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full min-w-0 bg-pattern">
        <header className={`flex items-center justify-between px-6 h-16 border-b ${colors.border} flex-shrink-0 backdrop-blur-md bg-[#080b12]/90`}>
          <div className="flex items-center gap-4 min-w-0">
            <button className="lg:hidden text-slate-400 hover:text-white flex-shrink-0" onClick={() => setIsMobileSidebarOpen(true)}><Menu size={24} /></button>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                {activeChat?.type === 'channel' ? <Hash size={18} className="text-slate-400" /> : <AtSign size={18} className="text-slate-400"/>}
                <h1 className="font-bold text-white text-lg leading-tight truncate">{activeChat?.name}</h1>
              </div>
              <div className={`text-xs flex items-center gap-1 ${colors.textMuted} truncate`}>
                {activeChat?.type === 'channel' ? (
                  <>
                    <Users size={12} />
                    <span>{activeChat?.participants?.includes('All') ? 'Public Room' : `${activeChat?.participants?.join(', ')}, You`}</span>
                  </>
                ) : (
                  <span>Direct Message</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeChat?.type === 'channel' && activeChatId !== 'global' && (
              <button onClick={() => openModal('invite_to_channel')} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e2536] transition-colors" title="Invite to Channel"><UserPlus size={20} /></button>
            )}
            <button className="text-slate-400 hover:text-white lg:hidden"><MoreVertical size={20} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
          {currentMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
              <div className={`w-16 h-16 rounded-2xl border-2 border-dashed ${colors.border} flex items-center justify-center mb-4 bg-[#121622]`}>
                {activeChat.type === 'channel' ? <Hash size={28} className={colors.textMuted} /> : <MessageSquare size={28} className={colors.textMuted} />}
              </div>
              <h3 className="text-white font-semibold mb-2">Welcome to the beginning!</h3>
              <p className={colors.textMuted}>This is the start of your {activeChat.type === 'channel' ? 'channel history' : `conversation with ${activeChat.name}`}. Say hi!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
              {currentMessages.map((msg) => {
                const isMe = msg.sender === userName;
                return (
                  <div key={msg.id} className={`flex gap-4 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <img 
                      src={msg.senderPhoto || "https://via.placeholder.com/40"} 
                      alt={msg.sender} 
                      className={`w-10 h-10 rounded-full flex-shrink-0 border ${isMe ? 'border-indigo-500/50' : 'border-slate-700'}`} 
                    />
                    <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-baseline gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span className="font-medium text-slate-200">{isMe ? 'You' : msg.sender}</span>
                        <span className="text-xs text-slate-500">{msg.timestamp}</span>
                      </div>
                      <div className={`px-4 py-2 rounded-2xl text-white inline-block shadow-sm ${isMe ? `${colors.primary} rounded-tr-none` : `bg-[#1e2536] rounded-tl-none border ${colors.border}`}`}>{msg.text}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className={`p-4 border-t ${colors.border} bg-[#080b12]`}>
          <form onSubmit={handleSendMessage} className={`max-w-5xl mx-auto relative flex items-center ${colors.inputBg} rounded-xl border border-transparent focus-within:border-slate-600 transition-colors shadow-sm`}>
            <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={`Message ${activeChat?.type === 'channel' ? '#' : '@'}${activeChat?.name}...`} className="w-full bg-transparent border-none text-slate-200 placeholder-slate-500 px-4 py-3.5 focus:outline-none focus:ring-0 text-sm" />
            {inputValue.trim() && (
              <button type="submit" className={`absolute right-2 p-2 rounded-lg ${colors.primary} ${colors.primaryHover} text-white transition-all transform scale-100 hover:scale-105 shadow-md`}><Send size={16} /></button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
