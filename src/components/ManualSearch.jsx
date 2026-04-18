import React from "react";

export function ManualSearch({ onManualFound, isLoading }) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedSource, setSelectedSource] = React.useState("lego");
  const [error, setError] = React.useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    setError("");

    if (!searchQuery.trim()) {
      setError("Please enter a product name or ID");
      return;
    }

    try {
      const { searchManual, formatManualAsInstructions } = await import("../lib/manualService");
      const manualData = await searchManual(searchQuery, selectedSource);
      const instructionText = formatManualAsInstructions(manualData);
      
      onManualFound(instructionText, manualData);
      setSearchQuery("");
    } catch (err) {
      setError(err.message || "Failed to search manual");
    }
  };

  return (
    <form onSubmit={handleSearch} className="manual-search-form">
      <div className="search-header">
        <p className="eyebrow">Database Search</p>
        <h3>Find assembly manuals</h3>
      </div>

      <div className="search-source-selector">
        <label>
          <input
            type="radio"
            name="source"
            value="lego"
            checked={selectedSource === "lego"}
            onChange={(e) => setSelectedSource(e.target.value)}
          />
          <span>LEGO</span>
        </label>
        <label>
          <input
            type="radio"
            name="source"
            value="ikea"
            checked={selectedSource === "ikea"}
            onChange={(e) => setSelectedSource(e.target.value)}
          />
          <span>IKEA</span>
        </label>
      </div>

      <div className="search-input-group">
        <input
          type="text"
          placeholder={
            selectedSource === "lego"
              ? "Enter LEGO set name or ID (e.g., 'Classic', '10293')"
              : "Enter IKEA product name (e.g., 'BILLY bookcase')"
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <button
          type="submit"
          className="primary-button"
          disabled={isLoading}
        >
          {isLoading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && <p className="search-error">{error}</p>}
    </form>
  );
}
