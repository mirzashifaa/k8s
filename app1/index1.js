const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 6000;

app.use(express.json());
const persistant_storage_path = '/shifa_PV_dir'

app.post('/store-file', (req, res) => {
    const { file, data } = req.body;

    if (!file || !data) {
        return res.status(400).json({ file: null, error: "Invalid JSON input." });
    }

    const filePath = path.join(persistant_storage_path, file);

    fs.writeFile(filePath, data, (err) => {
        if (err) {
            return res.status(500).json({ file, error: "Error while storing the file to the storage." });
        }
        return res.json({ file, message: "Success." });
    });
});

app.post('/calculate', async (req, res) => {
    const { file, product } = req.body;

    if (!file) {
        return res.status(400).json({ file: null, error: "Invalid JSON input." });
    }

    const filePath = path.join(persistant_storage_path, file);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({  file: null ,error: "File not found.",});
    }

    try {
        //changes need to be made for deployemnt in url
        const response = await axios.post('http://container2-service:6001/calculate', { file, product });
        return res.json(response.data);
    } catch (error) {
        return res.status(500).json({ error: "Input file not in CSV format.", file });
    }
});

app.listen(port, () => {
    console.log(`App1 listening on port ${port}`);
});
