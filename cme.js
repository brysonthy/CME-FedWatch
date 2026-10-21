const FEDWATCH_URL =
  "https://cmegroup-tools.quikstrike.net/User/QuikStrikeView.aspx?viewitemid=IntegratedFedWatchTool";

const CME_URL =
  "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html";


export default {
  async fetch(request, env) {
    try {
      const result = await scrapeAll();

      return json(result, result.ok ? 200 : 500);

    } catch (error) {
      return json({
        ok: false,
        error: error.message || String(error)
      }, 500);
    }
  },


  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runCron(env)
    );
  }
};


async function runCron(env) {
  try {
    if (!env.TELEGRAM_TOKEN) {
      throw new Error("Missing TELEGRAM_TOKEN");
    }

    if (!env.TELEGRAM_CHAT_ID) {
      throw new Error("Missing TELEGRAM_CHAT_ID");
    }

    const result = await scrapeAll();

    if (!result.ok) {
      throw new Error(result.error || "Scraping failed");
    }

    const telegram = await sendTelegram(
      env.TELEGRAM_TOKEN,
      env.TELEGRAM_CHAT_ID,
      result.message
    );

    return {
      ok: telegram.ok,
      message: result.message,
      telegram
    };

  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error)
    };
  }
}


async function scrapeAll() {
  const [cme, fedwatch] = await Promise.all([
    scrapeNextFomc(),
    scrapeFedWatch()
  ]);

  if (!cme.ok) {
    return cme;
  }

  if (!fedwatch.ok) {
    return fedwatch;
  }

  const message = formatMessage(
    cme,
    fedwatch
  );

  return {
    ok: true,
    next_fomc: cme,
    fedwatch,
    message
  };
}


async function scrapeNextFomc() {
  const response = await fetch(CME_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":
        "en-US,en;q=0.9"
    }
  });

  if (!response.ok) {
    return {
      ok: false,
      error: `CME HTTP ${response.status}`
    };
  }

  const html = await response.text();

  const match = html.match(
    /id=["']countdownClock["'][^>]*data-endtime=["']([^"']+)["']/i
  );

  if (!match) {
    return {
      ok: false,
      error: "Next FOMC meeting not found"
    };
  }

  const endTime = match[1];
  const meetingDate = new Date(endTime);

  if (isNaN(meetingDate.getTime())) {
    return {
      ok: false,
      error: "Invalid FOMC date"
    };
  }

  const now = new Date();

  const millisecondsRemaining =
    meetingDate.getTime() - now.getTime();

  const days = Math.max(
    0,
    Math.floor(
      millisecondsRemaining /
      (1000 * 60 * 60 * 24)
    )
  );

  const hours = Math.max(
    0,
    Math.floor(
      (millisecondsRemaining %
        (1000 * 60 * 60 * 24)) /
      (1000 * 60 * 60)
    )
  );

  return {
    ok: true,
    end_time: endTime,
    date: formatDateSGT(meetingDate),
    days,
    hours
  };
}


async function scrapeFedWatch() {
  const response = await fetch(FEDWATCH_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":
        "en-US,en;q=0.9",
      "Referer": CME_URL
    }
  });

  if (!response.ok) {
    return {
      ok: false,
      error: `FedWatch HTTP ${response.status}`
    };
  }

  const html = await response.text();

  const parsed = parseFedWatch(html);

  if (!parsed) {
    return {
      ok: false,
      error: "FedWatch data not found"
    };
  }

  return {
    ok: true,
    ...parsed
  };
}


function parseFedWatch(html) {
  const tables =
    html.match(/<table\b[\s\S]*?<\/table>/gi) || [];

  for (const table of tables) {
    const rows = [];

    const trs =
      table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];

    for (const tr of trs) {
      const cells =
        tr.match(
          /<(?:td|th)\b[\s\S]*?<\/(?:td|th)>/gi
        ) || [];

      const values = cells
        .map(cleanHtml)
        .filter(Boolean);

      if (values.length) {
        rows.push(values);
      }
    }

    let headerIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      const text = rows[i].join(" | ");

      if (
        /Target Rate/i.test(text) &&
        /Probability/i.test(text)
      ) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      continue;
    }

    const data = [];
    let dataAsOf = "";

    for (let i = headerIndex + 2; i < rows.length; i++) {
      const row = rows[i];

      if (!row.length) {
        continue;
      }

      const target = row[0];

      if (/Data as of/i.test(target)) {
        dataAsOf = target
          .replace(/^\*?\s*Data as of\s*/i, "")
          .trim();

        continue;
      }

      if (!/^\d{3}-\d{3}/.test(target)) {
        continue;
      }

      const probabilities = row
        .slice(1)
        .map(value => {
          const match = value.match(/([\d.]+)%/);

          return match ? `${match[1]}%` : "";
        });

      data.push({
        target,
        probabilities
      });
    }

    if (!data.length) {
      continue;
    }

    let current = "";
    const active = [];

    for (const row of data) {
      if (/\(Current\)/i.test(row.target)) {
        current = row.target
          .replace(/\s*\(Current\)/i, "")
          .trim();
      }

      const currentProbability =
        row.probabilities[0] || "";

      const number =
        parseFloat(currentProbability);

      if (!isNaN(number) && number > 0) {
        active.push(row);
      }
    }

    return {
      current,
      active,
      dataAsOf
    };
  }

  return null;
}


function formatMessage(cme, fedwatch) {
  const lines = [];

  lines.push("📊 <b>FEDWATCH</b>");

  lines.push(
    `🏦 Next FOMC: <b>${cme.date}</b>`
  );

  lines.push(
    `⏳ ${cme.days}d ${cme.hours}h`
  );

  lines.push(
    `🎯 Current: <b>${formatRate(fedwatch.current)}</b>`
  );

  lines.push("");

  for (const row of fedwatch.active) {
    const target = formatRate(
      row.target.replace(/\s*\(Current\)/i, "")
    );

    const probability =
      row.probabilities[0] || "-";

    lines.push(
      `<b>${target}:</b> ${probability}`
    );
  }

  return lines.join("\n");
}


async function sendTelegram(token, chatId, message) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.description || "Telegram error"
    };
  }

  return {
    ok: true,
    message_id: data.result?.message_id || null
  };
}


function formatDateSGT(date) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Singapore",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  ).format(date) + " SGT";
}


function formatRate(value) {
  return value.replace(/-/g, "–");
}


function cleanHtml(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8"
      }
    }
  );
}