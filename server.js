const express = require("express");
const axios = require("axios");
const app = express();
const PORT = 3015;
const activeTransactions = new Map(); // trxid → { data, status, masterTrxId, lastStatus }

// ====== Cache token sementara ======
let cachedToken = null;
let tokenExpireTime = 0;

// ====== Fungsi ambil token otomatis ======
async function getAccessToken(client_id, client_secret) {
  const now = Date.now();
  if (cachedToken && now < tokenExpireTime) {
    console.log("⚙️  Token masih aktif, pakai cache.");
    return cachedToken;
  }

  try {
    console.log("🔄 Mengambil token baru...");
    const url = "https://gateway.egw.xl.co.id/token";
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id,
      client_secret,
    });

    const response = await axios.post(url, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const { access_token, expires_in } = response.data;
    cachedToken = access_token;
    tokenExpireTime = now + expires_in * 1000;

    console.log("✅ Token baru berhasil diambil");
    return cachedToken;
  } catch (err) {
    throw new Error("Gagal mendapatkan token: " + err.message);
  }
}

// ====== Helper: ekstrak target dari berbagai bentuk response ======
function extractTargetFromResponse(responseData, requestBody) {
  // responseData kemungkinan: { data: { target: '0878...' } }
  // atau { data: [{ target: '0878...' , ... }] } atau other shapes
  try {
    if (!responseData) return null;

    // 1) langsung di responseData.data.target
    if (responseData.data && typeof responseData.data.target === "string") {
      return responseData.data.target;
    }

    // 2) responseData.data.target mungkin array
    if (
      responseData.data &&
      Array.isArray(responseData.data.target) &&
      responseData.data.target.length > 0
    ) {
      return responseData.data.target[0];
    }

    // 3) responseData.data mungkin array of objects: data[0].target
    if (
      Array.isArray(responseData.data) &&
      responseData.data[0] &&
      responseData.data[0].target
    ) {
      return responseData.data[0].target;
    }

    // 4) responseData.data mungkin object with nested data e.g. data.data[0].target
    if (
      responseData.data &&
      responseData.data.data &&
      Array.isArray(responseData.data.data) &&
      responseData.data.data[0] &&
      responseData.data.data[0].target
    ) {
      return responseData.data.data[0].target;
    }

    // 5) fallback: jika kita mengirim body.target (sebagai array), ambil element pertama
    if (requestBody && requestBody.target) {
      if (Array.isArray(requestBody.target) && requestBody.target.length > 0) {
        return requestBody.target[0];
      }
      if (typeof requestBody.target === "string") {
        return requestBody.target;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

// ====== CEK STOCK ======
app.get("/get-stock", async (req, res) => {
  try {
    const { client_id, client_secret, api_id, api_key, msisdn } = req.query;

    if (!client_id || !client_secret || !api_id || !api_key || !msisdn) {
      return res.json({
        status: "error",
        message:
          "Parameter client_id, client_secret, api_id, api_key, dan msisdn wajib diisi",
      });
    }

    const token = await getAccessToken(client_id, client_secret);

    const url = "https://gateway.egw.xl.co.id/awg/openapi/v1/get-stock";
    const headers = {
      "api-id": api_id,
      "api-key": api_key,
      msisdn: msisdn,
      Authorization: `Bearer ${token}`,
    };

    console.log(`[STOCK] Request ke ${msisdn}`);
    const response = await axios.post(url, {}, { headers });
    res.json({ status: "success", target: msisdn, data: response.data });
  } catch (err) {
    res.json({ status: "error", message: err.message });
  }
});

// ====== TEMBAK / INJECT ======
app.get("/post-tembak-inject", async (req, res) => {
  try {
    const {
      client_id,
      client_secret,
      api_id,
      api_key,
      username,
      idpaket,
      tembaktype,
      target,
    } = req.query;

    if (
      !client_id ||
      !client_secret ||
      !api_id ||
      !api_key ||
      !username ||
      !idpaket ||
      !tembaktype ||
      !target
    ) {
      return res.json({
        status: "error",
        message:
          "Parameter client_id, client_secret, api_id, api_key, username, idpaket, tembaktype, dan target wajib diisi",
      });
    }

    const token = await getAccessToken(client_id, client_secret);

    const url =
      "https://gateway.egw.xl.co.id/awg/openapi/v1/post-tembak-inject";
    const headers = {
      "api-id": api_id,
      "api-key": api_key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const body = {
      username,
      idPaket: idpaket,
      tembakType: tembaktype,
      target: [target],
    };

    console.log(`[TEMBAK] ${username} -> ${target} | Paket: ${idpaket}`);

    const response = await axios.post(url, body, { headers });

    // Ambil target dari response jika ada, fallback ke req.query.target
    const resolvedTarget =
      extractTargetFromResponse(response.data, body) || target || null;

    res.json({
      status: "success",
      target: resolvedTarget,
      data: response.data,
    });
  } catch (err) {
    console.error("❌ ERROR POST TEMBAK INJECT:", err.response?.data || err.message);
    res.json({
      status: "error",
      target: req.query.target || null,
      message: err.response?.data?.message || err.message,
      detail: err.response?.data || null,
    });
  }
});

// ====== INFO TRANSAKSI DETAIL ======
app.get("/post-info-trx-detail", async (req, res) => {
  try {
    const {
      client_id,
      client_secret,
      api_id,
      api_key,
      username,
      trxtype,
      mastertrxid,
      target,
    } = req.query;

    if (
      !client_id ||
      !client_secret ||
      !api_id ||
      !api_key ||
      !username ||
      !trxtype ||
      !mastertrxid
    ) {
      return res.json({
        status: "error",
        message:
          "Parameter client_id, client_secret, api_id, api_key, username, trxtype, dan mastertrxid wajib diisi",
      });
    }

    const token = await getAccessToken(client_id, client_secret);

    const url =
      "https://gateway.egw.xl.co.id/awg/openapi/v1/post-info-trx-detail";
    const headers = {
      "api-id": api_id,
      "api-key": api_key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const body = {
      username,
      trxInfoType: trxtype.toUpperCase().replace(/^CLIENT-/, ""),
      masterTrxId: mastertrxid,
    };

    console.log(`[INFO TRX DETAIL]`, body);

    const response = await axios.post(url, body, { headers });

    // Ambil target dari response, fallback ke req.query.target
    const resolvedTarget =
      target ||
      extractTargetFromResponse(response.data, null) ||
      response.data?.data?.[0]?.target ||
      null;

    res.json({
      status: "success",
      target: resolvedTarget,
      data: response.data,
    });
  } catch (err) {
    console.error("❌ ERROR INFO TRX DETAIL:", err.response?.data || err.message);
    res.json({
      status: "error",
      target: req.query.target || null,
      message: err.response?.data?.message || err.message,
      detail: err.response?.data || null,
    });
  }
});

// ====== TEMBAK OTOMATIS (sekali jalan sampai selesai) ======
app.get("/tembak-otomatis", async (req, res) => {
  try {
    const {
      client_id,
      client_secret,
      api_id,
      api_key,
      username,
      idpaket,
      tembaktype,
      target,
      callback_url,
      trxid,
    } = req.query;

    if (
      !client_id ||
      !client_secret ||
      !api_id ||
      !api_key ||
      !username ||
      !idpaket ||
      !tembaktype ||
      !target ||
      !trxid
    ) {
      return res.json({
        status: "error",
        message:
          "Parameter client_id, client_secret, api_id, api_key, username, idpaket, tembaktype, target, dan trxid wajib diisi",
      });
    }

    // ====== CEK DUPLIKAT TRXID ======
    if (activeTransactions.has(trxid)) {
      const existing = activeTransactions.get(trxid);
      console.log(`⚠️ Duplikat trxid: ${trxid}`);
      return res.json({
        status: "duplicate",
        message: "Transaksi dengan trxid ini sudah diproses sebelumnya",
        data: existing,
      });
    }

    // ====== SIMPAN STATUS AWAL ======
    activeTransactions.set(trxid, {
      trxid,
      target,
      masterTrxId: null,
      status: "initiated",
      result: null,
      started_at: new Date().toISOString(),
    });

    const token = await getAccessToken(client_id, client_secret);
    const headers = {
      "api-id": api_id,
      "api-key": api_key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // ====== STEP 1: Kirim tembak ======
    const urlTembak =
      "https://gateway.egw.xl.co.id/awg/openapi/v1/post-tembak-inject";
    const bodyTembak = {
      username,
      idPaket: idpaket,
      tembakType: tembaktype,
      target: [target],
    };

    console.log(`[🔥 TEMBAK] ${username} -> ${target} | trxid=${trxid}`);

    const tembakRes = await axios.post(urlTembak, bodyTembak, { headers });
    const masterTrxId = tembakRes.data?.data?.masterTrxId;

    if (!masterTrxId) {
      activeTransactions.set(trxid, {
        ...activeTransactions.get(trxid),
        status: "error",
        result: tembakRes.data,
      });
      return res.json({
        status: "error",
        message: "Gagal mendapatkan masterTrxId dari hasil tembak",
        detail: tembakRes.data,
      });
    }

    // Simpan masterTrxId
    activeTransactions.set(trxid, {
      ...activeTransactions.get(trxid),
      masterTrxId,
      status: "processing",
    });

    console.log(`➡️ MasterTrxId: ${masterTrxId}`);

    // ====== STEP 2: Kirim respon awal ======
    res.json({
      status: "success",
      trxid,
      masterTrxId,
      message:
        "Transaksi sedang diproses. Callback dan monitoring berjalan di background.",
    });

    // ====== STEP 3: Loop status ======
    const urlStatus =
      "https://gateway.egw.xl.co.id/awg/openapi/v1/post-info-trx-detail";
    let lastStatus = null;
    let done = false;
    let retry = 1;

    while (!done && retry <= 30) {
      try {
        const bodyStatus = {
          username,
          trxInfoType: tembaktype.toUpperCase().replace(/^CLIENT-/, ""),
          masterTrxId,
        };

        const statusRes = await axios.post(urlStatus, bodyStatus, { headers });
        const data = statusRes.data?.data?.[0];
        const statusMsg = data?.status || data?.message || "UNKNOWN";

        console.log(`[🔁 STATUS #${retry}] ${masterTrxId} => ${statusMsg}`);

        // Update cache status
        activeTransactions.set(trxid, {
          ...activeTransactions.get(trxid),
          status: statusMsg,
          result: data,
        });

        // Kirim callback jika berubah
        if (callback_url && statusMsg !== lastStatus) {
          try {
            await axios.post(callback_url, {
              trxid,
              target,
              masterTrxId,
              result: data,
              status: statusMsg,
            });
            console.log(`📩 Callback dikirim (${statusMsg})`);
            lastStatus = statusMsg;
          } catch (cbErr) {
            console.error("❌ Gagal kirim callback:", cbErr.message);
          }
        }

        if (/sukses|gagal|failed|berhasil/i.test(statusMsg)) {
          done = true;
          console.log(`✅ Transaksi ${trxid} selesai (${statusMsg})`);
        } else {
          retry++;
          await new Promise((r) => setTimeout(r, 5000));
        }
      } catch (err) {
        console.error("⚠️ Error cek status:", err.message);
        retry++;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    // Hapus dari active jika sudah final
    const finalData = activeTransactions.get(trxid);
    if (done) {
      setTimeout(() => activeTransactions.delete(trxid), 60_000); // auto-hapus 1 menit setelah selesai
    } else {
      finalData.status = "timeout";
    }

  } catch (err) {
    console.error("❌ ERROR TEMBAK OTOMATIS:", err.message);
    res.json({ status: "error", message: err.message });
  }
});

// ====== GET TOKEN MANUAL ======
app.get("/get-token", async (req, res) => {
  try {
    const { client_id, client_secret } = req.query;

    if (!client_id || !client_secret) {
      return res.json({
        status: "error",
        message: "Parameter client_id dan client_secret wajib diisi",
      });
    }

    const token = await getAccessToken(client_id, client_secret);
    res.json({
      status: "success",
      access_token: token,
      expire_time: new Date(tokenExpireTime).toISOString(),
    });
  } catch (err) {
    console.error("❌ ERROR GET TOKEN:", err.message);
    res.json({ status: "error", message: err.message });
  }
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`🚀 Axis API Server running at http://localhost:${PORT}`);
});
