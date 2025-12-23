import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useNodes as useNodesContext } from '../App';
import HoloNode from './HoloNode';
import './KnowledgeTree.css';

const nodeTypes = {
  holoNode: HoloNode
};

function KnowledgeTreeInner({ onNodeClick, highlightedNodeId, onHighlightClear }) {
  const { nodes: dbNodes, createNode, updateNode } = useNodesContext();
  const { fitView, setCenter } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const initialLayoutDone = useRef(false);

  // Convert DB nodes to React Flow format with tree layout
  useEffect(() => {
    if (dbNodes.length === 0) return;

    // Build tree structure
    const nodeMap = new Map();
    const rootNodes = [];
    
    dbNodes.forEach(node => {
      nodeMap.set(node.id, { ...node, children: [] });
    });
    
    dbNodes.forEach(node => {
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id).children.push(nodeMap.get(node.id));
      } else if (!node.parent_id) {
        rootNodes.push(nodeMap.get(node.id));
      }
    });

    // Calculate positions using radial layout
    const flowNodes = [];
    const flowEdges = [];
    
    const layoutTree = (node, depth = 0, angle = 0, angleSpan = Math.PI * 2, parentPos = null) => {
      const radius = depth * 250;
      const x = node.position_x || (parentPos ? parentPos.x + Math.cos(angle) * radius : 0);
      const y = node.position_y || (parentPos ? parentPos.y + Math.sin(angle) * radius : 0);
      
      flowNodes.push({
        id: node.id,
        type: 'holoNode',
        position: { x, y },
        data: {
          ...node,
          isRoot: depth === 0,
          isHighlighted: node.id === highlightedNodeId
        }
      });

      if (node.parent_id) {
        flowEdges.push({
          id: `${node.parent_id}-${node.id}`,
          source: node.parent_id,
          target: node.id,
          type: 'default',
          animated: node.id === highlightedNodeId,
          style: {
            stroke: node.id === highlightedNodeId ? '#00ffff' : 'rgba(0, 255, 255, 0.4)',
            strokeWidth: node.id === highlightedNodeId ? 3 : 2
          }
        });
      }

      if (node.children.length > 0) {
        const childAngleSpan = angleSpan / node.children.length;
        node.children.forEach((child, index) => {
          const childAngle = angle - angleSpan / 2 + childAngleSpan * (index + 0.5);
          layoutTree(child, depth + 1, childAngle, childAngleSpan * 0.8, { x, y });
        });
      }
    };

    rootNodes.forEach((root, index) => {
      layoutTree(root, 0, (Math.PI * 2 / rootNodes.length) * index);
    });

    setNodes(flowNodes);
    setEdges(flowEdges);

    // Initial fit view
    if (!initialLayoutDone.current && flowNodes.length > 0) {
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 500 });
        initialLayoutDone.current = true;
      }, 100);
    }
  }, [dbNodes, setNodes, setEdges, fitView, highlightedNodeId]);

  // Fly to highlighted node
  useEffect(() => {
    if (highlightedNodeId) {
      const node = nodes.find(n => n.id === highlightedNodeId);
      if (node) {
        setCenter(node.position.x, node.position.y, { zoom: 1.5, duration: 800 });
        setTimeout(() => {
          onHighlightClear?.();
        }, 2000);
      }
    }
  }, [highlightedNodeId, nodes, setCenter, onHighlightClear]);

  const handleNodeClick = useCallback((event, node) => {
    const dbNode = dbNodes.find(n => n.id === node.id);
    if (dbNode) {
      onNodeClick(dbNode);
    }
  }, [dbNodes, onNodeClick]);

  const handleAddNode = useCallback(async (parentId, position) => {
    await createNode(parentId, position);
  }, [createNode]);

  const handleNodeDragStop = useCallback(async (event, node) => {
    await updateNode(node.id, {
      positionX: node.position.x,
      positionY: node.position.y
    });
  }, [updateNode]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onNodeDragStop={handleNodeDragStop}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{
        type: 'default',
        style: { stroke: 'rgba(0, 255, 255, 0.4)', strokeWidth: 2 }
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background 
        color="rgba(0, 255, 255, 0.05)" 
        gap={50} 
        size={1}
      />
      <Controls 
        showInteractive={false}
        position="bottom-left"
      />
      <MiniMap 
        nodeColor={(node) => node.data?.isRoot ? '#00ffff' : '#a855f7'}
        maskColor="rgba(0, 0, 0, 0.8)"
        position="bottom-right"
      />
    </ReactFlow>
  );
}

function KnowledgeTree(props) {
  return (
    <div className="knowledge-tree">
      <ReactFlowProvider>
        <KnowledgeTreeInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export default KnowledgeTree;
