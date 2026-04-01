import BlockchainViewer from "../features/BlockchainViewer";

export default function ViewBlockchain({ account }) {
  return (
    <div className="p-6">
      <BlockchainViewer globalAccount={account} />
    </div>
  );
}
