const timeoutConfigurado = Number(process.env.EXTERNAL_API_TIMEOUT_MS);
const timeoutMs = Number.isFinite(timeoutConfigurado) && timeoutConfigurado >= 500 && timeoutConfigurado <= 60000
  ? timeoutConfigurado
  : 8000;

class ErroApiExterna extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ErroApiExterna";
    this.status = status;
  }
}

async function getJson(url, { service, headers = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new ErroApiExterna(`${service} respondeu com o status ${response.status}.`, response.status === 404 ? 404 : 502);
    }

    try {
      return await response.json();
    } catch {
      throw new ErroApiExterna(`${service} retornou uma resposta JSON inválida.`);
    }
  } catch (error) {
    if (error instanceof ErroApiExterna) throw error;
    const detalhe = error.name === "AbortError" ? `tempo limite de ${timeoutMs} ms excedido` : error.message;
    throw new ErroApiExterna(`Não é possível se comunicar com ${service}: ${detalhe}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getJson, ErroApiExterna };
