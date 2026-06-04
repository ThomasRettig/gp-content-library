# GP Content Library

A geospatial research database and study tool designed for A-Level General Paper (GP) students. This interactive application allows users to organize, visualize, and master real-world case studies through an immersive map-based interface.

## 🚀 Features

* **Interactive World Map**: Powered by D3.js, featuring smooth zooming, panning boundaries to prevent "map loss," and "Cover" logic to ensure a full-screen experience on all devices.
* **Theme-based Filtering**: Quickly filter case studies by themes (e.g., Environment, Technology, Human Rights) using a dynamic pill-based filter system.
* **Mastery System**: Track your revision progress with a persistent "Mark as Mastered" feature. Mastered pins glow gold on the map and save their state to your browser's local storage.
* **Dynamic Sidebar**: View detailed case study analysis rendered from Markdown files. Includes support for YAML front-matter metadata like location, date, and themes.
* **Contextual Evidence**: Automatically suggests "Related Evidence" at the bottom of each article based on shared thematic tags.

## 🛠️ Tech Stack

* **Visualization**: [D3.js](https://d3js.org/) (Geographic projections and Zoom/Pan behavior)
* **Styling**: [Tailwind CSS](https://tailwindcss.com/) (Utility-first UI components)
* **Parsing**: [js-yaml](https://github.com/nodeca/js-yaml) (Front-matter metadata) & [marked.js](https://marked.js.org/) (Markdown rendering)
* **Language**: Vanilla JavaScript (ES6+)

## 📁 Project Structure

```text
├── index.html          # Main application shell
├── style.css           # Custom animations (Mastery pulse) and layout overrides
├── main.js             # Core logic: Map rendering, Filtering, and Mastery system
├── data.json           # Central database for coordinates and metadata
├── content/            # Directory containing .md files for case studies

```

## ⚙️ Setup & Installation

1. **Clone the repository**:
```bash
git clone https://github.com/ThomasRettig/gp-content-library.git

```


2. **Run a local server**:
Because the project fetches local JSON and Markdown files, you must run it through a local server to avoid CORS issues.
* **Using VS Code**: Install the "Live Server" extension and click "Go Live."
* **Using NPX**: Run `npx live-server` in the root directory.
* **Using Python**: Run `python -m http.server 8000` in the root directory.



## 📝 How to Add Case Studies

1. **Create a Markdown file** in your content folder (e.g., `content/my-case-study.md`):
```markdown
---
title: "The Rise of Vertical Farming"
location: "Singapore"
date: "12 May 2024"
themes: "Technology, Environment"
---
# Analysis
Your GP analysis goes here...

```


2. **Register the point** in `data.json`:

Run `node generate-data.js` in the root directory and `data.json` will automatically be populated with your newly added Markdown entry, like so:

```json
{
  "displayLabel": "Vertical Farming",
  "lat": 1.3521,
  "lng": 103.8198,
  "file": "data/my-case-study.md",
  "themes": "Technology, Environment"
}

```
