# 📊 CME FedWatch Telegram Bot

A serverless Cloudflare Worker that retrieves the next Federal Open Market Committee (FOMC) meeting date and CME FedWatch interest-rate probabilities, then sends a formatted summary to Telegram.

Designed for automated monitoring of US Federal Reserve rate expectations, with an HTTP endpoint for manual checks and a scheduled trigger for automated Telegram reports.

## ✨ Features

- **Next FOMC Meeting** — Retrieves the next meeting date from the CME Group website.
- **Meeting Countdown** — Displays the remaining days and hours until the next FOMC meeting.
- **Current Federal Funds Rate** — Identifies the current target-rate range.
- **FedWatch Probabilities** — Extracts target-rate ranges and their associated probabilities.
- **Telegram Notifications** — Sends formatted messages using the Telegram Bot API.
- **Scheduled Execution** — Supports automatic reports through Cloudflare Cron Triggers.
- **HTTP Endpoint** — Returns scraped data as JSON for manual testing or integration.
- **Serverless Deployment** — Runs on Cloudflare Workers without maintaining a dedicated server.

## 🛠️ Tech Stack

- JavaScript (ES Modules)
- Cloudflare Workers
- CME Group FedWatch Tool
- Telegram Bot API

## 📋 Example Telegram Message

```text
📊 FEDWATCH
🏦 Next FOMC: 04 Nov 2026
⏳ 13d 5h
🎯 Current: 3.50–3.75%

3.50–3.75%: 85.0%
3.25–3.50%: 15.0%
```

*Illustrative example only. Actual meeting dates, rate ranges, and probabilities depend on the latest available source data.*

![Example FEDWatch Telegram message](https://github.com/brysonthy/CME-FedWatch/blob/main/FEDWatch-Telegram-Message.png?raw=true)

## ⚙️ How It Works

1. The Worker requests the CME Group FOMC countdown page.
2. It extracts the next meeting's date and calculates the remaining time.
3. It requests the CME FedWatch data page.
4. It parses the HTML tables to identify the current target-rate range and probabilities.
5. It formats the extracted information into a Telegram-friendly message.
6. The message is sent to the configured Telegram chat when triggered by a scheduled event.

Both data sources are requested concurrently to reduce execution time.

## 🚀 Setup

### 1. Create a Cloudflare Worker

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Open **Workers & Pages**.
3. Create a new Worker.
4. Paste the JavaScript source code into the Worker editor.
5. Save and deploy the Worker.

### 2. Create a Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram.
2. Create a bot using `/newbot`.
3. Copy the bot token.
4. Start a conversation with your bot or add it to your intended group.
5. Obtain the appropriate Telegram chat ID.

Keep your bot token private.

### 3. Configure Environment Variables

In your Cloudflare Worker settings, add the following variables:

![Telegram Secrets configuration](https://github.com/brysonthy/CME-FedWatch/blob/main/Telegram-Secrets.png?raw=true)

| Variable | Description |
|---|---|
| `TELEGRAM_TOKEN` | Telegram bot API token |
| `TELEGRAM_CHAT_ID` | Destination Telegram chat ID |

Add these under **Settings → Variables and Secrets**. Store `TELEGRAM_TOKEN` as a secret rather than hardcoding it into the source code.

### 4. Configure Scheduled Reports

Open the Worker settings and configure a Cron Trigger to run at your preferred interval.

![Cloudflare Cron Trigger configuration](https://github.com/brysonthy/CME-FedWatch/blob/main/Cron-Trigger.png?raw=true)

For example, to run daily at midnight Singapore time, use the UTC cron expression:

```text
0 16 * * *
```

Singapore Time (SGT) is UTC+8, so 16:00 UTC corresponds to 00:00 SGT on the following day.

Cloudflare Cron Triggers use UTC. Check the [Cloudflare Cron Triggers documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/) for configuration details.

## 🔍 Testing

### Test the HTTP Endpoint

Open your deployed Worker URL in a browser or use `curl`:

```bash
curl https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
```

A successful response should contain JSON similar to:

```json
{
  "ok": true,
  "next_fomc": {
    "ok": true,
    "date": "04 Nov 2026",
    "days": 13,
    "hours": 5
  },
  "fedwatch": {
    "ok": true,
    "current": "350-375",
    "active": []
  },
  "message": "..."
}
```

The values above are illustrative. The actual response depends on the source HTML and the parser's results.

### Test Telegram Notifications

Run the Worker using its scheduled trigger or configure a test invocation that calls the scheduled handler. Verify that the configured bot can send messages to the destination chat.

## ⚠️ Limitations

- **HTML scraping:** The Worker relies on the structure of CME Group webpages. Changes to page markup can break extraction.
- **Dynamic content:** FedWatch data may be rendered by JavaScript or loaded through separate endpoints. If the requested HTML does not contain the relevant table, parsing may fail.
- **Source availability:** CME Group may block requests, introduce rate limits, or change access requirements.
- **Data freshness:** The report reflects the data available when the Worker runs. It is not a guarantee of real-time updates.
- **Parsing accuracy:** Always verify extracted probabilities against the official CME FedWatch Tool.
- **Countdown precision:** The countdown is calculated from the source timestamp and the Worker execution time.

The Worker returns an error response when it cannot retrieve or parse the required data.

## 🔗 Sources

- [CME FedWatch Tool](https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html)
- [CME FedWatch Data Page](https://cmegroup-tools.quikstrike.net/User/QuikStrikeView.aspx?viewitemid=IntegratedFedWatchTool)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## 🔐 Security

- Never commit Telegram bot tokens or other secrets to GitHub.
- Use Cloudflare Worker secrets for sensitive credentials.
- Avoid exposing private chat IDs unnecessarily.
- Restrict access to any endpoints that expose sensitive operational information if you extend the Worker.

## 📄 Disclaimer

This project is for informational and educational purposes only. FedWatch probabilities are market-implied estimates, not confirmed Federal Reserve decisions or guarantees of future interest rates.

This project is not affiliated with or endorsed by CME Group, the Federal Reserve, or Telegram.
