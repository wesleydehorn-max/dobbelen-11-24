const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(`
<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dobbelen 11/24</title>
<style>
body {
  margin: 0;
  background: #0b5d3b;
  color: white;
  font-family: Arial, sans-serif;
  text-align: center;
}

h1 {
  margin-top: 50px;
  font-size: 36px;
}

.box {
  max-width: 500px;
  margin: 40px auto;
  padding: 30px;
  background: #06452d;
  border: 3px solid #d4af37;
  border-radius: 20px;
}

button {
  background: #d4af37;
  border: none;
  padding: 16px 30px;
  border-radius: 10px;
  font-size: 20px;
  font-weight: bold;
}
</style>
</head>

<body>
  <div class="box">
    <h1>🎲 Dobbelen 11/24</h1>
    <p>De online server is actief!</p>
    <button onclick="alert('De game komt hier!')">
      BEGIN WORP
    </button>
  </div>
</body>
</html>
  `);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Dobbelen 11/24 draait op poort " + PORT);
});
