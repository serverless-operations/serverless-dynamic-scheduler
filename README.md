# Serverless Dynamic Scheduler

## Usage

Create a `.env` file from `.env.example`

- `INVOKER_ALPHA_WEBHOOK_URL`
  - Set the webhook URL for slack

### Example request for invoker-alpha

The `invoker-alpha` sends a message to slack at the time it is scheduled.

The following request is an example POST request body to send to the API.

```json
{
  "publishTime": 1645670700,
  "channel": "invoker-alpha",
	"parameters": {
		"message": "Invocation test from invoker-alpha"
	}
}
```