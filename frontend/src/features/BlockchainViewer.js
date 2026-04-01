import React, { useEffect, useState } from "react";
import ReactFlow, { MiniMap, Controls, Background } from "reactflow";
import { ethers } from "ethers";
import "reactflow/dist/style.css";
import './BlockchainViewer.css'; 
import { getContract } from "../utils/ethereum";
import WalletConnect from "../components/WalletConnect";

const statusMap = {
  0: "Created",
  1: "Sold",
  2: "Delivered",
  3: "Refunded"
};

function BlockchainViewer() {
  const [blocks, setBlocks] = useState([]);
  const [error, setError] = useState("");
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [account, setAccount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRootId, setSelectedRootId] = useState("");

  // Fetch blockchain data directly from the Smart Contract
  const fetchBatches = async () => {
    setIsLoading(true);
    setError("");
    try {
      const { contract } = await getContract();
      const countBigInt = await contract.batchCount();
      const numBatches = parseInt(countBigInt.toString());
      
      let results = [];
      for (let id = 1; id <= numBatches; id++) {
        const batch = await contract.batches(id);
        results.push({
          id: batch.id.toString(),
          parentId: batch.parentId.toString(),
          name: batch.name,
          quantity: batch.quantity.toString(),
          remainingQuantity: batch.remainingQuantity.toString(),
          price: batch.price.toString(),
          status: statusMap[batch.status] || "Unknown",
        });
      }
      setBlocks(results);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch batches from the blockchain. Are you connected to the right network?");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (account) {
      fetchBatches();
    }
  }, [account]);

  // Convert blocks to React Flow nodes/edges and isolate families
  useEffect(() => {
    if (blocks.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    let displayBlocks = blocks;

    if (selectedRootId) {
      // Find all descendants of the selected root block
      let chain = [];
      let queue = [selectedRootId];
      
      while (queue.length > 0) {
        const currentId = queue.shift();
        const block = blocks.find(b => b.id === currentId);
        if (block) {
          chain.push(block);
          // Find all immediate children of this block
          const children = blocks.filter(b => b.parentId === currentId);
          queue.push(...children.map(c => c.id));
        }
      }
      displayBlocks = chain;
    }

    const flowEdges = displayBlocks
      .filter((block) => block.parentId && block.parentId !== "0")
      .map((block) => ({
        id: `e-${block.parentId}-${block.id}`,
        source: block.parentId,
        target: block.id,
        animated: true,
        style: { stroke: "#2e7d32", strokeWidth: 2 },
      }));

    // mathematical tree layout algorithm
    const nodeWidth = 280;
    const nodeHeight = 220;

    // Build children mapping for O(1) lookups
    const childrenMap = {};
    displayBlocks.forEach(b => {
      childrenMap[b.id] = displayBlocks.filter(child => child.parentId === b.id);
    });

    // Find roots (blocks that act as top-level nodes in whatever is currently displayed)
    const roots = displayBlocks.filter(
      b => b.parentId === "0" || !displayBlocks.some(parent => parent.id === b.parentId)
    );

    const subtreeWidths = {};
    const calculateWidth = (node) => {
      const children = childrenMap[node.id] || [];
      if (children.length === 0) {
        subtreeWidths[node.id] = 1;
        return 1;
      }
      let width = 0;
      children.forEach(c => { width += calculateWidth(c); });
      subtreeWidths[node.id] = width;
      return width;
    };

    roots.forEach(r => calculateWidth(r));

    const layout = {};
    const assignLayout = (node, depth, leftBound) => {
      const children = childrenMap[node.id] || [];
      if (children.length === 0) {
        layout[node.id] = { x: leftBound, y: depth * nodeHeight };
        return;
      }
      
      let currentX = leftBound;
      children.forEach(c => {
        assignLayout(c, depth + 1, currentX);
        currentX += subtreeWidths[c.id] * nodeWidth;
      });
      
      // parent x is centered perfectly over its subtree
      const firstChildX = layout[children[0].id].x;
      const lastChildX = layout[children[children.length - 1].id].x;
      layout[node.id] = { x: (firstChildX + lastChildX) / 2, y: depth * nodeHeight };
    };

    let currentRootX = 0;
    roots.forEach(r => {
      assignLayout(r, 0, currentRootX);
      currentRootX += subtreeWidths[r.id] * nodeWidth + 50; // Add padding between different trees
    });

    const flowNodes = displayBlocks.map((block) => {
      let displayPrice = block.price;
      try {
        displayPrice = ethers.formatEther(block.price);
      } catch(e) {}

      return {
        id: block.id,
        data: {
          label: (
            <div
              style={{
                padding: 12,
                border: "2px solid #2e7d32",
                borderRadius: 10,
                background: "#f1f8e9",
                color: "#1b5e20",
                minWidth: 200,
              }}
            >
              <strong>{block.name}</strong>
              <p><strong>Batch ID:</strong> {block.id}</p>
              <p><strong>Initial Qty:</strong> {block.quantity} kg</p>
              <p><strong>Remaining:</strong> <span style={{ color: block.remainingQuantity === "0" ? "#d32f2f" : "#2e7d32", fontWeight: "bold" }}>{block.remainingQuantity} kg</span></p>
              <p><strong>Price:</strong> {displayPrice}</p>
              <p><strong>Status:</strong> {block.status}</p>
            </div>
          ),
        },
        position: layout[block.id] || { x: 250, y: 150 },    
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [blocks, selectedRootId]);

  const rootBatches = blocks.filter(b => b.parentId === "0");

  return (
    <div className="viewer-container" style={{ height: "80vh", display: "flex", flexDirection: "column" }}>
      <h2 className="viewer-title">🌾 Blockchain Produce Explorer</h2>
      
      <div style={{ alignSelf: "center", marginBottom: "1rem" }}>
         <WalletConnect onConnect={setAccount} />
      </div>

      {account && !isLoading && blocks.length > 0 && (
        <div style={{ alignSelf: "center", marginBottom: "1rem", display: "flex", gap: "10px", alignItems: "center" }}>
          <label style={{ fontWeight: "bold", color: "#2e7d32" }}>View Specific Harvest Chain:</label>
          <select 
            value={selectedRootId} 
            onChange={(e) => setSelectedRootId(e.target.value)}
            style={{ padding: "8px", borderRadius: "5px", border: "2px solid #2e7d32", minWidth: "200px" }}
          >
            <option value="">Show All Transactions (Raw)</option>
            {rootBatches.map(b => (
              <option key={b.id} value={b.id}>
                Chain #{b.id} ({b.name} - {b.quantity}kg)
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="error-text text-center text-red-500">{error}</p>}
      
      {isLoading && <p className="loading-text text-center text-gray-500 font-bold animate-pulse">Querying the Blockchain...</p>}
      
      {!account && !isLoading && (
        <p className="text-center text-gray-600 mt-8">Connect MetaMask to view transparency reports on-chain.</p>
      )}

      {account && !isLoading && nodes.length === 0 && !error && (
        <p className="loading-text text-center text-gray-400">No batches recorded on-chain yet.</p>
      )}

      {nodes.length > 0 && (
        <div style={{ flexGrow: 1, position: "relative" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodesDraggable={true}
            nodesConnectable={false}
            zoomOnScroll={true}
            panOnScroll={true}
            fitView
          >
            <MiniMap nodeColor={() => "#00ffff"} />
            <Controls />
            <Background color="#222" gap={16} />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}

export default BlockchainViewer;
