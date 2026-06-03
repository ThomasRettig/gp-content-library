const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const contentDir = path.join(__dirname, 'content');
const outputFile = path.join(__dirname, 'data.json');

function generateData() {
    const files = fs.readdirSync(contentDir);
    const allData = [];

    files.forEach(file => {
        if (file.endsWith('.md')) {
            const filePath = path.join(contentDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Extract the YAML block between the --- dashes
            const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
            
            if (match) {
                const data = yaml.load(match[1]);
                data.file = `content/${file}`;
                // Fallback to title if label is missing
                data.displayLabel = data.label || data.title; 
                allData.push(data);
            }
        }
    });

    fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2));
    console.log(`✅ Success: data.json updated with ${allData.length} entries.`);
}

generateData();