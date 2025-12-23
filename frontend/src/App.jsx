import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { io } from 'socket.io-client';
import KnowledgeTree from './components/KnowledgeTree';
import ArticleModal from './components/ArticleModal';
import SearchBar from './components/SearchBar';
import UserPresence from './components/UserPresence';
import './styles/App.css';

// Socket Context
const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

// User Context
const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

// Nodes Context
const NodesContext = createContext(null);
export const useNodes = () => useContext(NodesContext);

function App() {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [highlightedNodeId, setHighlightedNodeId] = useState(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('user:init', (userData) => {
      setUser(userData);
    });

    newSocket.on('users:update', (usersList) => {
      setUsers(usersList);
    });

    newSocket.on('node:created', (node) => {
      setNodes(prev => [...prev, node]);
    });

    newSocket.on('node:updated', (updatedNode) => {
      setNodes(prev => prev.map(n => n.id === updatedNode.id ? updatedNode : n));
    });

    newSocket.on('node:deleted', ({ id }) => {
      setNodes(prev => prev.filter(n => n.id !== id));
      if (selectedNode?.id === id) {
        setSelectedNode(null);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Fetch initial nodes
  useEffect(() => {
    fetchNodes();
  }, []);

  const fetchNodes = async () => {
    try {
      const response = await fetch('/api/nodes');
      const data = await response.json();
      setNodes(data);
    } catch (error) {
      console.error('Error fetching nodes:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNode = async (parentId, position) => {
    try {
      const response = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          title: 'Новый узел',
          positionX: position?.x || 0,
          positionY: position?.y || 0,
          authorId: user?.id || 'anonymous'
        })
      });
      const newNode = await response.json();
      return newNode;
    } catch (error) {
      console.error('Error creating node:', error);
    }
  };

  const updateNode = async (nodeId, updates) => {
    try {
      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          lastEditorId: user?.id
        })
      });
      const updatedNode = await response.json();
      return updatedNode;
    } catch (error) {
      console.error('Error updating node:', error);
    }
  };

  const deleteNode = async (nodeId) => {
    try {
      await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Error deleting node:', error);
    }
  };

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setHighlightedNodeId(null);
      return;
    }

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const results = await response.json();
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const handleSearchSelect = (nodeId) => {
    setHighlightedNodeId(nodeId);
    setSearchResults([]);
    // Auto-open after fly animation
    setTimeout(() => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) setSelectedNode(node);
    }, 800);
  };

  const openNode = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  const closeNode = useCallback(() => {
    setSelectedNode(null);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p className="loading-text">Инициализация HoloTree...</p>
      </div>
    );
  }

  return (
    <SocketContext.Provider value={socket}>
      <UserContext.Provider value={{ user, setUser, users }}>
        <NodesContext.Provider value={{ nodes, createNode, updateNode, deleteNode }}>
          <div className="app">
            <div className="grid-background" />
            
            <header className="app-header">
              <div className="logo">
                <span className="logo-icon">◈</span>
                <span className="logo-text">HoloTree</span>
              </div>
              
              <SearchBar 
                onSearch={handleSearch}
                results={searchResults}
                onSelect={handleSearchSelect}
              />
              
              <UserPresence />
            </header>

            <main className="app-main">
              <KnowledgeTree 
                onNodeClick={openNode}
                highlightedNodeId={highlightedNodeId}
                onHighlightClear={() => setHighlightedNodeId(null)}
              />
            </main>

            {selectedNode && (
              <ArticleModal 
                node={selectedNode}
                onClose={closeNode}
              />
            )}
          </div>
        </NodesContext.Provider>
      </UserContext.Provider>
    </SocketContext.Provider>
  );
}

export default App;
