import React, { useState } from 'react';
import './TutorialModal.css';

export default function TutorialModal({ title, explanation, icon, onProceed, onCancel, storageKey }) {
  const [dontShow, setDontShow] = useState(false);

  const handleConfirm = () => {
    if (dontShow && storageKey) {
      localStorage.setItem(storageKey, "true");
    }
    onProceed();
  };

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-card">
        <div className="tutorial-header">
          <span className="tutorial-icon">{icon || "🛡️"}</span>
          <h2 className="tutorial-title">{title}</h2>
        </div>
        
        <div className="tutorial-body">
          {explanation}
        </div>

        <div className="tutorial-footer">
          <label className="tutorial-checkbox-label">
            <input 
              type="checkbox" 
              checked={dontShow} 
              onChange={(e) => setDontShow(e.target.checked)} 
            />
            <span>Don't show this warning again</span>
          </label>

          <div className="tutorial-actions">
            <button className="tutorial-btn cancel-btn" onClick={onCancel}>
              Cancel Activity
            </button>
            <button className="tutorial-btn confirm-btn" onClick={handleConfirm}>
              I Understand & Proceed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
