# Start and stop a shared user test

## Start sharing

1. Open Tailscale on your laptop and make sure it says **Connected**.
2. In File Explorer, open the `Prototype` folder and double-click **Share user test.cmd**. One black window starts the app and Tailscale Funnel. Keep it open.
3. Wait for **Vite ready** and **API on**. Open the HTTPS address under **Available on the internet**. That address opens the app and uses your existing Sarvam key for live AI.
4. Open or create your test board at that HTTPS address. Click **Copy board link** and send it to your testers. The link should start with `https://` and contain `.ts.net`. Keep your laptop awake and online during the test.

## Stop sharing

1. Click the black **Share user test** window and press **Ctrl+C**. If Windows asks **Terminate batch job (Y/N)?**, type **Y** and press Enter. This stops the app and the foreground Funnel. Saved boards are kept for next time.
2. Open PowerShell and run the command below. **No serve config** confirms no Funnel route is configured. You can also try the public link from your phone on mobile data.

   ```powershell
   & "$env:ProgramFiles\Tailscale\tailscale.exe" funnel status
   ```

3. If it still lists a public route pointing to `127.0.0.1:5197`, close any old PowerShell window running Funnel. If that route remains, run the following in **Administrator PowerShell**, then check status again.

   ```powershell
   & "$env:ProgramFiles\Tailscale\tailscale.exe" funnel 5197 off
   ```

You can leave Tailscale connected after stopping Funnel. For local-only testing, double-click **Start user test.cmd** instead.
