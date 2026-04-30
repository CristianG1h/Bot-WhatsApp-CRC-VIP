const express = require("express");
const { PORT } = require("./config");

const healthRoutes = require("./routes/health");
const whatsappRoutes = require("./routes/whatsapp");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

app.use("/", healthRoutes);
app.use("/webhook", whatsappRoutes);

app.listen(PORT, () => {
  console.log(`✅ Bot CRC VIP activo en puerto ${PORT}`);
});
