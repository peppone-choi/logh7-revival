using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

public static class LOGH7Launcher
{
    private const int Port = 47900;
    private const int AdminPort = 47910;
    private const string Host = "127.0.0.1";
    private const string BootstrapAccount = "ginei00";
    private const string BootstrapPassword = "dummy";
    private const int DeferredUpdateExitCode = 194;
    private const int StdOutputHandle = -11;
    private const uint FontResourcePublic = 0;
    private const uint WmFontChange = 0x001D;
    private const uint SmtoAbortIfHung = 0x0002;
    private const int GwlStyle = -16;
    private const int GwlExStyle = -20;
    private const int SwpFrameChanged = 0x0020;
    private const int SwpShowWindow = 0x0040;
    private const int SwpNoSize = 0x0001;
    private const int SwpNoMove = 0x0002;
    private const uint WsPopup = 0x80000000;
    private const uint WsVisible = 0x10000000;
    private const uint WsExDlgModalFrame = 0x00000001;
    private const uint WsExToolWindow = 0x00000080;
    private const uint WsExWindowEdge = 0x00000100;
    private const uint WsExClientEdge = 0x00000200;
    private const uint WsExStaticEdge = 0x00020000;
    private const uint WsExAppWindow = 0x00040000;
    private const uint MonitorDefaultToNearest = 0x00000002;
    private const uint CreateSuspended = 0x00000004;
    private const string DefaultDisplayMode = "windowed";
    private const string DefaultCursorClip = "auto";
    private static readonly object LogLock = new object();
    private static readonly IntPtr InvalidHandleValue = new IntPtr(-1);
    private static readonly IntPtr HwndBroadcast = new IntPtr(0xFFFF);

    [STAThread]
    public static int Main(string[] args)
    {
        RuntimePaths pathsForLog = null;
        try
        {
            var paths = RuntimePaths.Create(AppDomain.CurrentDomain.BaseDirectory);
            pathsForLog = paths;
            paths.Validate();
            Directory.CreateDirectory(paths.LogDir);
            if (HasArg(args, "--check"))
            {
                AppendLog(paths.LauncherLog, "check ok");
                return 0;
            }
            if (HasArg(args, "--client-preflight"))
            {
                return RunClientPreflight(paths);
            }
            if (HasArg(args, "--update-check"))
            {
                return RunUpdateScript(paths, false, false);
            }
            if (IsUpdateMode(args))
            {
                return RunUpdateScript(paths, true, false);
            }
            if (HasArg(args, "--signup-smoke"))
            {
                RequireLocalRuntime(paths, "회원가입 smoke");
                return RunSignupSmoke(paths);
            }
            if (HasArg(args, "--signup"))
            {
                RequireLocalRuntime(paths, "회원가입");
                return ShowSignup(paths);
            }

            if (!HasArg(args, "--skip-update"))
            {
                var updateExitCode = RunUpdateScript(paths, false, true);
                if (updateExitCode == DeferredUpdateExitCode)
                {
                    return 0;
                }
                if (updateExitCode != 0 && IsUpdateStrict())
                {
                    throw new InvalidOperationException("업데이트 확인에 실패했습니다. " + paths.UpdaterLog);
                }
            }

            ConfigureWindows(paths);
            if (!HasArg(args, "--server-smoke") && !HasArg(args, "--no-client-preflight"))
            {
                RunClientPreflight(paths);
            }
            var server = default(Process);
            var startedServer = false;
            try
            {
                if (paths.HasLocalServerRuntime && !IsPortOpen(Host, Port, 250))
                {
                    EnsureBootstrapAccount(paths);
                    server = StartServer(paths);
                    startedServer = true;
                    WaitForServer(paths, server);
                }
                else if (!paths.HasLocalServerRuntime)
                {
                    AppendLog(paths.LauncherLog, "client-only package: local server runtime is not bundled");
                }

                if (HasArg(args, "--server-smoke"))
                {
                    RequireLocalRuntime(paths, "서버 smoke");
                    return 0;
                }

                var displayMode = ResolveDisplayMode(args);
                var cursorClip = ResolveCursorClip(args);
                ConfigureDgVoodooDisplayMode(paths, displayMode);
                var client = StartClient(paths);
                ApplyWindowDisplayMode(paths, client, displayMode);
                ApplyCursorClip(paths, client, displayMode, cursorClip);
                try
                {
                    if (HasArg(args, "--client-smoke"))
                    {
                        WaitForClientSmoke(paths, client);
                        KillProcess(client);
                        return 0;
                    }
                    client.WaitForExit();
                    AppendLog(paths.LauncherLog, "client exited with code " + client.ExitCode);
                    return client.ExitCode;
                }
                finally
                {
                    ReleaseCursorClip(paths);
                    client.Dispose();
                }
            }
            finally
            {
                if (startedServer)
                {
                    KillProcess(server);
                }
            }
        }
        catch (Exception ex)
        {
            AppendLauncherException(pathsForLog, ex);
            if (IsAutomationMode(args))
            {
                Console.Error.WriteLine(ex.Message);
                return 1;
            }
            MessageBox.Show(ex.Message, "LOGH VII launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static void AppendLauncherException(RuntimePaths paths, Exception ex)
    {
        try
        {
            var logPath = paths != null
                ? paths.LauncherLog
                : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher.log");
            var logDir = Path.GetDirectoryName(logPath);
            if (!String.IsNullOrEmpty(logDir))
            {
                Directory.CreateDirectory(logDir);
            }
            AppendLog(logPath, "launcher failed: " + ex.GetType().FullName + ": " + ex.Message);
            if (ex.InnerException != null)
            {
                AppendLog(
                    logPath,
                    "launcher inner: " + ex.InnerException.GetType().FullName + ": " + ex.InnerException.Message);
            }
        }
        catch
        {
        }
    }

    private static bool HasArg(string[] args, string value)
    {
        for (var i = 0; i < args.Length; i += 1)
        {
            if (StringComparer.OrdinalIgnoreCase.Equals(args[i], value))
            {
                return true;
            }
        }
        return false;
    }

    private static bool IsAutomationMode(string[] args)
    {
        return HasArg(args, "--check") || HasArg(args, "--server-smoke") || HasArg(args, "--client-smoke")
            || HasArg(args, "--client-preflight") || HasArg(args, "--signup-smoke")
            || HasArg(args, "--update") || HasArg(args, "--update-check");
    }

    private static bool IsUpdateMode(string[] args)
    {
        return HasArg(args, "--update")
            || HasArg(args, "--update-only")
            || StringComparer.OrdinalIgnoreCase.Equals(Path.GetFileName(Application.ExecutablePath), "업데이트.exe");
    }

    private static void RequireLocalRuntime(RuntimePaths paths, string action)
    {
        if (!paths.HasLocalServerRuntime)
        {
            throw new InvalidOperationException(action + "에는 서버 런타임이 필요합니다. 클라이언트 전용 패키지에서는 서버/어드민에서 계정을 준비하세요.");
        }
    }

    private static int RunUpdateScript(RuntimePaths paths, bool manual, bool launchAfterDeferredUpdate)
    {
        if (!File.Exists(paths.UpdateScript))
        {
            AppendLog(paths.UpdaterLog, "update script not bundled: " + paths.UpdateScript);
            if (manual)
            {
                MessageBox.Show("업데이트 스크립트를 찾을 수 없습니다.", "업데이트", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            return 0;
        }

        var psi = new ProcessStartInfo();
        psi.FileName = "powershell.exe";
        psi.WorkingDirectory = paths.Root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(paths.UpdateScript)
            + " -Root " + Quote(paths.Root)
            + " -ParentPid " + Process.GetCurrentProcess().Id.ToString()
            + " -RunningExe " + Quote(Application.ExecutablePath)
            + (launchAfterDeferredUpdate ? " -LaunchAfterUpdate" : "")
            + (manual ? " -Manual" : "");

        using (var process = Process.Start(psi))
        {
            if (process == null)
            {
                AppendLog(paths.UpdaterLog, "failed to start updater script");
                return 1;
            }
            if (!process.WaitForExit(120000))
            {
                KillProcess(process);
                AppendLog(paths.UpdaterLog, "update script timed out");
                return 1;
            }
            AppendProcessOutput(paths.UpdaterLog, process.StandardOutput.ReadToEnd());
            AppendProcessOutput(paths.UpdaterLog, process.StandardError.ReadToEnd());
            if (manual)
            {
                var message = process.ExitCode == DeferredUpdateExitCode
                    ? "업데이트를 적용하기 위해 실행기를 다시 시작합니다."
                    : "업데이트 확인이 끝났습니다.";
                MessageBox.Show(message, "업데이트", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            return process.ExitCode;
        }
    }

    private static void AppendProcessOutput(string logPath, string output)
    {
        if (String.IsNullOrWhiteSpace(output))
        {
            return;
        }
        var lines = output.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < lines.Length; i += 1)
        {
            AppendLog(logPath, lines[i]);
        }
    }

    private static int ShowSignup(RuntimePaths paths)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var form = new SignupForm(paths))
        {
            Application.Run(form);
            return form.ExitCode;
        }
    }

    private static int RunSignupSmoke(RuntimePaths paths)
    {
        var account = "smoke" + DateTime.UtcNow.Ticks.ToString();
        const string password = "Smoke17";
        var result = RegisterAccount(paths, account, password);
        if (!result.Ok)
        {
            throw new InvalidOperationException(result.Message);
        }
        VerifyAccountExists(paths, account);
        WriteSignupSmokeTranscript(paths, account, result.Message);
        return 0;
    }

    private static void WriteSignupSmokeTranscript(RuntimePaths paths, string account, string message)
    {
        var lines = new[]
        {
            "LOGH VII 계정 회원가입 smoke 성공",
            "계정: " + account,
            "계정 DB: " + paths.AccountDb,
            "admin exists 확인: " + account,
            message,
        };
        for (var i = 0; i < lines.Length; i += 1)
        {
            AppendLog(paths.LauncherLog, lines[i]);
            WriteAutomationLine(lines[i]);
        }
    }

    private static void EnsureBootstrapAccount(RuntimePaths paths)
    {
        Directory.CreateDirectory(paths.StateDir);
        var exists = RunAdminCommand(paths, new[]
        {
            "admin", "exists", BootstrapAccount, "--account-db", paths.AccountDb,
        });
        if (exists.ExitCode == 0)
        {
            AppendLog(paths.LauncherLog, "bootstrap account already exists: " + BootstrapAccount);
            return;
        }

        var result = RegisterAccount(paths, BootstrapAccount, BootstrapPassword);
        if (!result.Ok)
        {
            throw new InvalidOperationException("자동 로그인 계정 준비에 실패했습니다: " + result.Message);
        }
        AppendLog(paths.LauncherLog, "bootstrap account created: " + BootstrapAccount);
    }

    private static SignupResult RegisterAccount(RuntimePaths paths, string account, string password)
    {
        if (!IsValidAccount(account))
        {
            return SignupResult.Fail("계정 ID는 1~32자의 출력 가능한 ASCII 문자만 사용할 수 있습니다.");
        }
        if (String.IsNullOrEmpty(password))
        {
            return SignupResult.Fail("비밀번호를 입력하세요.");
        }
        if (!IsValidPassword(password))
        {
            return SignupResult.Fail("비밀번호는 앞뒤 공백 없이 1~8자의 출력 가능한 ASCII 문자만 사용할 수 있습니다.");
        }

        Directory.CreateDirectory(paths.StateDir);
        var command = RunAdminCommand(paths, new[]
        {
            "admin", "create", account, "--password-stdin", "--account-db", paths.AccountDb,
        }, password);
        if (command.ExitCode == 0)
        {
            return SignupResult.Success("계정 등록이 완료되었습니다. 이제 같은 계정으로 게임에 로그인하세요.");
        }
        return SignupResult.Fail(LocalizeAdminError(command.OutputText));
    }

    private static void VerifyAccountExists(RuntimePaths paths, string account)
    {
        var command = RunAdminCommand(paths, new[]
        {
            "admin", "exists", account, "--account-db", paths.AccountDb,
        });
        if (command.ExitCode != 0)
        {
            throw new InvalidOperationException("회원가입 smoke 검증에 실패했습니다: " + command.OutputText);
        }
    }

    private static AdminCommandResult RunAdminCommand(RuntimePaths paths, string[] args)
    {
        return RunAdminCommand(paths, args, null);
    }

    private static AdminCommandResult RunAdminCommand(RuntimePaths paths, string[] args, string standardInput)
    {
        var psi = new ProcessStartInfo();
        psi.FileName = paths.NodeExe;
        psi.WorkingDirectory = paths.Root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.RedirectStandardInput = standardInput != null;
        psi.Arguments = Quote(paths.ServerEntry) + " " + JoinArguments(args);
        psi.EnvironmentVariables["NODE_NO_WARNINGS"] = "1";

        using (var process = Process.Start(psi))
        {
            if (process == null)
            {
                throw new InvalidOperationException("회원가입 처리기를 시작하지 못했습니다.");
            }
            if (standardInput != null)
            {
                process.StandardInput.Write(standardInput);
                process.StandardInput.Close();
            }
            if (!process.WaitForExit(15000))
            {
                KillProcess(process);
                throw new TimeoutException("회원가입 처리 시간이 초과되었습니다.");
            }
            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();
            return new AdminCommandResult(process.ExitCode, stdout, stderr);
        }
    }

    private static string LocalizeAdminError(string output)
    {
        var message = ExtractAdminReason(output);
        if (message.StartsWith("account already exists:", StringComparison.Ordinal))
        {
            var account = message.Substring("account already exists:".Length).Trim();
            return account.Length > 0 ? "이미 등록된 계정입니다: " + account : "이미 등록된 계정입니다.";
        }
        if (message.StartsWith("invalid account label:", StringComparison.Ordinal))
        {
            return "계정 ID는 1~32자의 출력 가능한 ASCII 문자만 사용할 수 있습니다.";
        }
        if (StringComparer.Ordinal.Equals(message, "account id is required"))
        {
            return "계정 ID를 입력하세요.";
        }
        if (StringComparer.Ordinal.Equals(message, "password is required"))
        {
            return "비밀번호를 입력하세요.";
        }
        if (StringComparer.Ordinal.Equals(message, "password must be 1-8 printable ASCII characters")
            || StringComparer.Ordinal.Equals(message, "password must be 1-8 non-space printable ASCII characters")
            || StringComparer.Ordinal.Equals(message, "password must be 1-8 printable ASCII characters without surrounding spaces"))
        {
            return "비밀번호는 앞뒤 공백 없이 1~8자의 출력 가능한 ASCII 문자만 사용할 수 있습니다.";
        }
        if (message.StartsWith("account limit reached", StringComparison.Ordinal))
        {
            return "등록 가능한 계정 수를 초과했습니다.";
        }
        return "등록에 실패했습니다. 입력값을 확인하세요.";
    }

    private static string ExtractAdminReason(string output)
    {
        var lines = output.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        for (var i = lines.Length - 1; i >= 0; i -= 1)
        {
            var line = lines[i].Trim();
            if (line.StartsWith("create failed:", StringComparison.Ordinal))
            {
                return line.Substring("create failed:".Length).Trim();
            }
        }
        return lines.Length > 0 ? lines[lines.Length - 1].Trim() : "";
    }

    private static bool IsValidAccount(string account)
    {
        if (String.IsNullOrEmpty(account) || account.Length > 32)
        {
            return false;
        }
        for (var i = 0; i < account.Length; i += 1)
        {
            var ch = account[i];
            if (ch < 0x20 || ch > 0x7e)
            {
                return false;
            }
        }
        return true;
    }

    private static bool IsValidPassword(string password)
    {
        if (String.IsNullOrEmpty(password) || password.Length > 8 || !StringComparer.Ordinal.Equals(password.Trim(), password))
        {
            return false;
        }
        for (var i = 0; i < password.Length; i += 1)
        {
            var ch = password[i];
            if (ch < 0x20 || ch > 0x7e)
            {
                return false;
            }
        }
        return true;
    }

    private static string JoinArguments(string[] args)
    {
        var quoted = new string[args.Length];
        for (var i = 0; i < args.Length; i += 1)
        {
            quoted[i] = Quote(args[i]);
        }
        return String.Join(" ", quoted);
    }

    private static void ConfigureWindows(RuntimePaths paths)
    {
        using (var key = Registry.CurrentUser.CreateSubKey(@"Software\BOTHTEC\銀河英雄伝説VII\1.0"))
        {
            if (key != null)
            {
                key.SetValue("Install", paths.Root, RegistryValueKind.String);
            }
        }

        using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"))
        {
            if (key != null)
            {
                const string flags = "~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE";
                key.SetValue(paths.ClientExe, flags, RegistryValueKind.String);
                key.SetValue(paths.LegacyLauncherExe, flags, RegistryValueKind.String);
            }
        }

        if (File.Exists(paths.StringFile) && !File.Exists(paths.StringBackup))
        {
            File.Copy(paths.StringFile, paths.StringBackup, false);
        }
        ConfigureKoreanMenuMode(paths);
        InstallFonts(paths);
        RegisterBundledFonts(paths);
    }

    private static void ConfigureKoreanMenuMode(RuntimePaths paths)
    {
        var hangeulOk = WriteProfileString("windows", "hangeulmenu", "hangeul");
        var kanjiOk = WriteProfileString("windows", "kanjimenu", "roman");
        AppendLog(paths.LauncherLog, "win.ini Korean menu mode hangeulmenu=" + hangeulOk + " kanjimenu=" + kanjiOk);
    }

    private static void InstallFonts(RuntimePaths paths)
    {
        if (!File.Exists(paths.FontInstallScript))
        {
            AppendLog(paths.LauncherLog, "Pretendard installer not bundled: " + paths.FontInstallScript);
            return;
        }
        if (!Directory.Exists(paths.FontsDir))
        {
            AppendLog(paths.LauncherLog, "Pretendard fonts not bundled: " + paths.FontsDir);
            return;
        }
        var ttfCount = Directory.GetFiles(paths.FontsDir, "*.ttf", SearchOption.AllDirectories).Length;
        var otfCount = Directory.GetFiles(paths.FontsDir, "*.otf", SearchOption.AllDirectories).Length;
        if (ttfCount + otfCount == 0)
        {
            AppendLog(paths.LauncherLog, "Pretendard font payload is empty: " + paths.FontsDir);
            return;
        }

        var psi = new ProcessStartInfo();
        psi.FileName = "powershell.exe";
        psi.WorkingDirectory = paths.Root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(paths.FontInstallScript);
        using (var process = Process.Start(psi))
        {
            if (process == null)
            {
                AppendLog(paths.LauncherLog, "Pretendard installer failed to start");
                return;
            }
            if (!process.WaitForExit(60000))
            {
                KillProcess(process);
                AppendLog(paths.LauncherLog, "Pretendard installer timed out");
                return;
            }
            AppendLog(paths.LauncherLog, "Pretendard installer exit " + process.ExitCode);
            if (process.ExitCode != 0 && IsFontInstallStrict())
            {
                throw new InvalidOperationException("Pretendard font install failed with exit code " + process.ExitCode);
            }
        }
    }

    private static void RegisterBundledFonts(RuntimePaths paths)
    {
        if (!Directory.Exists(paths.FontsDir))
        {
            AppendLog(paths.LauncherLog, "Pretendard fonts not bundled for session registration: " + paths.FontsDir);
            return;
        }

        var fontFiles = Directory.GetFiles(paths.FontsDir, "*.ttf", SearchOption.AllDirectories);
        var otfFiles = Directory.GetFiles(paths.FontsDir, "*.otf", SearchOption.AllDirectories);
        var loaded = 0;
        for (var i = 0; i < fontFiles.Length; i += 1)
        {
            loaded += Math.Max(0, AddFontResourceEx(fontFiles[i], FontResourcePublic, IntPtr.Zero));
        }
        for (var i = 0; i < otfFiles.Length; i += 1)
        {
            loaded += Math.Max(0, AddFontResourceEx(otfFiles[i], FontResourcePublic, IntPtr.Zero));
        }

        UIntPtr result;
        SendMessageTimeout(HwndBroadcast, WmFontChange, UIntPtr.Zero, String.Empty, SmtoAbortIfHung, 5000, out result);
        AppendLog(paths.LauncherLog, "Pretendard session fonts loaded " + loaded);
    }

    private static bool IsFontInstallStrict()
    {
        var value = Environment.GetEnvironmentVariable("LOGH_FONT_INSTALL_STRICT");
        return StringComparer.OrdinalIgnoreCase.Equals(value, "1")
            || StringComparer.OrdinalIgnoreCase.Equals(value, "true")
            || StringComparer.OrdinalIgnoreCase.Equals(value, "yes")
            || StringComparer.OrdinalIgnoreCase.Equals(value, "on");
    }

    private static bool IsUpdateStrict()
    {
        var value = Environment.GetEnvironmentVariable("LOGH_UPDATE_STRICT");
        return StringComparer.OrdinalIgnoreCase.Equals(value, "1")
            || StringComparer.OrdinalIgnoreCase.Equals(value, "true")
            || StringComparer.OrdinalIgnoreCase.Equals(value, "yes")
            || StringComparer.OrdinalIgnoreCase.Equals(value, "on");
    }

    private static Process StartServer(RuntimePaths paths)
    {
        Directory.CreateDirectory(paths.StateDir);
        Directory.CreateDirectory(paths.LogDir);
        Directory.CreateDirectory(paths.TraceDir);
        AppendLog(paths.ServerLog, "starting local LOGH VII server");

        var psi = new ProcessStartInfo();
        psi.FileName = paths.NodeExe;
        psi.WorkingDirectory = paths.Root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.Arguments = Quote(paths.ServerEntry) + " serve-auth --host " + Host + " --port " + Port
            + " --admin-host " + Host
            + " --admin-port " + AdminPort
            + " --client-exe " + Quote(paths.ClientExe)
            + " --trace " + Quote(paths.TracePath)
            + " --account-db " + Quote(paths.AccountDb)
            + " --session-db " + Quote(paths.SessionDb);
        SetServerEnv(psi, paths);

        var process = Process.Start(psi);
        if (process == null)
        {
            throw new InvalidOperationException("failed to start local LOGH VII server");
        }
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
        {
            if (eventArgs.Data != null)
            {
                AppendLog(paths.ServerLog, eventArgs.Data);
            }
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
        {
            if (eventArgs.Data != null)
            {
                AppendLog(paths.ServerLog, eventArgs.Data);
            }
        };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static void SetServerEnv(ProcessStartInfo psi, RuntimePaths paths)
    {
        var adminToken = ResolveAdminToken(paths);
        psi.EnvironmentVariables["LOGH_ACCOUNT_DB"] = paths.AccountDb;
        psi.EnvironmentVariables["LOGH_SESSION_DB"] = paths.SessionDb;
        psi.EnvironmentVariables["LOGH_LOBBY_OK_FORMAT"] = "message32";
        psi.EnvironmentVariables["LOGH_LOBBY_RICH_CHARACTERS"] = "1";
        psi.EnvironmentVariables["LOGH_LOBBY_EARLY_OK"] = "1";
        psi.EnvironmentVariables["LOGH_SS_FORMAT"] = "message32";
        psi.EnvironmentVariables["LOGH_WORLD_PLAYER"] = "1";
        psi.EnvironmentVariables["LOGH_WORLD_IMPORT_BASES"] = "1";
        psi.EnvironmentVariables["LOGH_PLANET_BASE_RECORDS"] = "1";
        psi.EnvironmentVariables["LOGH_STRAT_GRID"] = "1";
        psi.EnvironmentVariables["LOGH_STRAT_TERRAIN"] = "1";
        psi.EnvironmentVariables["LOGH_STRAT_FLEET"] = "1";
        psi.EnvironmentVariables["LOGH_STRAT_GALAXY"] = "1";
        psi.EnvironmentVariables["LOGH_STRAT_GRID_EARLY"] = "1";
        psi.EnvironmentVariables["LOGH_TACTICS_UNIT"] = "1";
        psi.EnvironmentVariables["LOGH_GRID_ENTER"] = "1";
        psi.EnvironmentVariables["LOGH_FULL_UNIT_LOCATION"] = "1";
        psi.EnvironmentVariables["LOGH_POSTLOAD_PLAYER_RECORD"] = "1";
        psi.EnvironmentVariables["LOGH_POSTLOAD_RICH_CHARACTER"] = "1";
        psi.EnvironmentVariables["LOGH_POSTLOAD_ACTION_LIST_SEATS"] = "1";
        psi.EnvironmentVariables["LOGH_ACTION_LIST_CATEGORY"] = "0";
        // 2026-06-29 live: generic 0x0305 command-card preload stalls NOW LOADING.
        psi.EnvironmentVariables["LOGH_COMMAND_TABLE_PRELOAD_PROBE"] = "0";
        psi.EnvironmentVariables["LOGH_DEV_COMMAND_GRANT_ALL"] = "0";
        psi.EnvironmentVariables["LOGH_PLAYER_FOCUS_CELL"] = "1";
        psi.EnvironmentVariables["LOGH_SEED_CANON_NPCS"] = "1";
        psi.EnvironmentVariables["LOGH_BASE_ECONOMY"] = "1";
        // 2026-06-29 live: ship master passes world entry. Keep troop/P3 seed
        // tables off; ship+troop and seed+ships exit before 0x0f02.
        psi.EnvironmentVariables["LOGH_STATIC_SHIPS"] = "1";
        psi.EnvironmentVariables["LOGH_STATIC_SHIPS_LIMIT"] = "1";
        psi.EnvironmentVariables["LOGH_STATIC_TROOPS"] = "0";
        psi.EnvironmentVariables["LOGH_STATIC_FIGHTERS"] = "0";
        psi.EnvironmentVariables["LOGH_STATIC_ARMS"] = "0";
        psi.EnvironmentVariables["LOGH_STATIC_POWER_DISTRIBUTION"] = "0";
        psi.EnvironmentVariables["LOGH_STATIC_MASTER_PLAYABLE_SEED"] = "0";
        psi.EnvironmentVariables["LOGH_CONTENT_DB"] = "1";
        psi.EnvironmentVariables["LOGH_KO_NAMES"] = "1";
        psi.EnvironmentVariables["LOGH_SCENARIO"] = Path.Combine(paths.RuntimeRoot, "content", "scenarios", "canon-801-07.json");
        psi.EnvironmentVariables["LOGH_REPOSITORY_BACKEND"] = "sqlite";
        psi.EnvironmentVariables["LOGH_SQLITE_PATH"] = paths.WorldStateDb;
        psi.EnvironmentVariables["LOGH_ADMIN_HOST"] = Host;
        psi.EnvironmentVariables["LOGH_ADMIN_PORT"] = AdminPort.ToString();
        psi.EnvironmentVariables["LOGH_ADMIN_TOKEN"] = adminToken;
    }

    private static string ResolveAdminToken(RuntimePaths paths)
    {
        var fromEnv = Environment.GetEnvironmentVariable("LOGH_ADMIN_TOKEN");
        if (!String.IsNullOrWhiteSpace(fromEnv) && fromEnv.Length >= 12)
        {
            return fromEnv;
        }
        Directory.CreateDirectory(paths.StateDir);
        if (File.Exists(paths.AdminTokenFile))
        {
            var existing = File.ReadAllText(paths.AdminTokenFile, Encoding.UTF8).Trim();
            if (existing.Length >= 12)
            {
                return existing;
            }
        }
        var token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        File.WriteAllText(paths.AdminTokenFile, token + Environment.NewLine, Encoding.UTF8);
        AppendLog(paths.LauncherLog, "created admin token file " + paths.AdminTokenFile);
        return token;
    }

    private static Process StartClient(RuntimePaths paths)
    {
        AppendLog(paths.LauncherLog, "starting client " + paths.ClientExe);
        var psi = new ProcessStartInfo();
        psi.FileName = paths.ClientExe;
        psi.WorkingDirectory = paths.ClientDir;
        psi.UseShellExecute = false;
        Process process;
        try
        {
            process = Process.Start(psi);
        }
        catch (Win32Exception ex)
        {
            if (ex.NativeErrorCode == 4551)
            {
                var message = BuildAppControlBlockedMessage(paths.ClientExe);
                AppendLog(paths.LauncherLog, message);
                throw new InvalidOperationException(message, ex);
            }
            throw;
        }
        catch (InvalidOperationException ex)
        {
            if (ex.Message.IndexOf("Application Control", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                var message = BuildAppControlBlockedMessage(paths.ClientExe);
                AppendLog(paths.LauncherLog, message);
                throw new InvalidOperationException(message, ex);
            }
            throw;
        }
        if (process == null)
        {
            throw new InvalidOperationException("failed to start game client");
        }
        AppendLog(paths.LauncherLog, "client process " + process.Id + " started");
        return process;
    }

    private static int RunClientPreflight(RuntimePaths paths)
    {
        AppendLog(paths.LauncherLog, "client launch preflight " + paths.ClientExe);
        var startup = new StartupInfo();
        startup.Size = Marshal.SizeOf(typeof(StartupInfo));
        var processInfo = new ProcessInformation();
        var commandLine = new StringBuilder(Quote(paths.ClientExe));
        var ok = CreateProcess(
            paths.ClientExe,
            commandLine,
            IntPtr.Zero,
            IntPtr.Zero,
            false,
            CreateSuspended,
            IntPtr.Zero,
            paths.ClientDir,
            ref startup,
            out processInfo);
        if (!ok)
        {
            var errorCode = Marshal.GetLastWin32Error();
            if (errorCode == 4551)
            {
                var message = BuildAppControlBlockedMessage(paths.ClientExe);
                AppendLog(paths.LauncherLog, message);
                throw new InvalidOperationException(message, new Win32Exception(errorCode));
            }
            throw new Win32Exception(errorCode);
        }

        try
        {
            AppendLog(paths.LauncherLog, "client launch preflight ok: process created suspended");
            TerminateProcess(processInfo.Process, 0);
            return 0;
        }
        finally
        {
            if (processInfo.Thread != IntPtr.Zero)
            {
                CloseHandle(processInfo.Thread);
            }
            if (processInfo.Process != IntPtr.Zero)
            {
                CloseHandle(processInfo.Process);
            }
        }
    }

    private static string BuildAppControlBlockedMessage(string clientExe)
    {
        return "Windows Application Control / Smart App Control blocked the game client: " + clientExe
            + ". Check Event Viewer > Applications and Services Logs > Microsoft > Windows > CodeIntegrity > Operational "
            + "events 3033 and 3077. The launcher and server may be allowed while G7MTClient.exe is still blocked.";
    }

    private static string ResolveDisplayMode(string[] args)
    {
        var mode = Environment.GetEnvironmentVariable("LOGH_DISPLAY_MODE");
        for (var i = 0; i < args.Length; i += 1)
        {
            if (StringComparer.OrdinalIgnoreCase.Equals(args[i], "--display-mode") && i + 1 < args.Length)
            {
                mode = args[i + 1];
            }
        }
        if (String.IsNullOrWhiteSpace(mode))
        {
            return DefaultDisplayMode;
        }
        mode = mode.Trim().ToLowerInvariant();
        if (mode == "windowed" || mode == "fullscreen" || mode == "borderless")
        {
            return mode;
        }
        throw new InvalidOperationException("display mode must be windowed, fullscreen, or borderless");
    }

    private static string ResolveCursorClip(string[] args)
    {
        var policy = Environment.GetEnvironmentVariable("LOGH_CURSOR_CLIP");
        for (var i = 0; i < args.Length; i += 1)
        {
            if (StringComparer.OrdinalIgnoreCase.Equals(args[i], "--cursor-clip") && i + 1 < args.Length)
            {
                policy = args[i + 1];
            }
            if (StringComparer.OrdinalIgnoreCase.Equals(args[i], "--no-cursor-clip"))
            {
                policy = "off";
            }
        }
        if (String.IsNullOrWhiteSpace(policy))
        {
            return DefaultCursorClip;
        }
        policy = policy.Trim().ToLowerInvariant();
        if (policy == "auto" || policy == "on" || policy == "off")
        {
            return policy;
        }
        throw new InvalidOperationException("cursor clip policy must be auto, on, or off");
    }

    private static void ConfigureDgVoodooDisplayMode(RuntimePaths paths, string mode)
    {
        if (!File.Exists(paths.DgVoodooConfig))
        {
            AppendLog(paths.LauncherLog, "dgVoodoo config not bundled: " + paths.DgVoodooConfig);
            return;
        }
        var borderless = mode == "borderless";
        var windowed = mode == "windowed";
        var windowedPresentation = borderless || windowed;
        SetDgVoodooValue(paths.DgVoodooConfig, "FullScreenMode", windowedPresentation ? "false" : "true");
        SetDgVoodooValue(paths.DgVoodooConfig, "ScalingMode", windowedPresentation ? "centered" : "stretched");
        SetDgVoodooValue(paths.DgVoodooConfig, "Resampling", windowedPresentation ? "pointsampled" : "lanczos-3");
        SetDgVoodooValue(paths.DgVoodooConfig, "WindowedAttributes", borderless ? "borderless" : "");
        SetDgVoodooValue(paths.DgVoodooConfig, "FullscreenAttributes", mode == "borderless" ? "fake" : "fullscreensize");
        SetDgVoodooValue(paths.DgVoodooConfig, "WatermarkDisplayDuration", "1");
        SetDgVoodooValue(paths.DgVoodooConfig, "3DfxWatermark", "false");
        SetDgVoodooValue(paths.DgVoodooConfig, "3DfxSplashScreen", "false");
        SetDgVoodooValue(paths.DgVoodooConfig, "dgVoodooWatermark", "false");
        SetDgVoodooValue(paths.DgVoodooConfig, "Filtering", windowedPresentation ? "appdriven" : "16");
        SetDgVoodooValue(paths.DgVoodooConfig, "Antialiasing", windowedPresentation ? "off" : "4x");
        SetDgVoodooValue(paths.DgVoodooConfig, "RTTexturesForceScaleAndMSAA", windowedPresentation ? "false" : "true");
        SetDgVoodooValue(paths.DgVoodooConfig, "SmoothedDepthSampling", windowedPresentation ? "false" : "true");
        AppendLog(paths.LauncherLog, "display mode configured: " + mode);
    }

    private static void SetDgVoodooValue(string path, string key, string value)
    {
        var lines = File.ReadAllLines(path, Encoding.UTF8);
        var matched = false;
        for (var i = 0; i < lines.Length; i += 1)
        {
            var trimmed = lines[i].TrimStart();
            if (!trimmed.StartsWith(key, StringComparison.Ordinal) || trimmed.IndexOf('=') < 0)
            {
                continue;
            }
            var prefixLength = lines[i].Length - trimmed.Length;
            lines[i] = lines[i].Substring(0, prefixLength) + key.PadRight(36) + " = " + value;
            matched = true;
        }
        if (!matched)
        {
            Array.Resize(ref lines, lines.Length + 1);
            lines[lines.Length - 1] = key.PadRight(36) + " = " + value;
        }
        File.WriteAllLines(path, lines, Encoding.UTF8);
    }

    private static void ApplyWindowDisplayMode(RuntimePaths paths, Process client, string mode)
    {
        var hwnd = WaitForMainWindow(client, 10000);
        if (hwnd == IntPtr.Zero)
        {
            AppendLog(paths.LauncherLog, mode + " display mode skipped: client window not found");
            return;
        }
        var monitor = MonitorFromWindow(hwnd, MonitorDefaultToNearest);
        var info = new MonitorInfo();
        info.Size = Marshal.SizeOf(typeof(MonitorInfo));
        if (!GetMonitorInfo(monitor, ref info))
        {
            AppendLog(paths.LauncherLog, mode + " display mode skipped: monitor info unavailable");
            return;
        }
        if (mode == "windowed")
        {
            AppendLog(paths.LauncherLog, "display mode applied: windowed");
            return;
        }
        SetMenu(hwnd, IntPtr.Zero);
        var oldExStyle = unchecked((uint)GetWindowLong(hwnd, GwlExStyle));
        var frameExMask = WsExDlgModalFrame | WsExWindowEdge | WsExClientEdge | WsExStaticEdge | WsExToolWindow;
        SetWindowLong(hwnd, GwlStyle, unchecked((int)(WsPopup | WsVisible)));
        SetWindowLong(hwnd, GwlExStyle, unchecked((int)((oldExStyle & ~frameExMask) | WsExAppWindow)));
        var x = info.Monitor.Left;
        var y = info.Monitor.Top;
        var width = info.Monitor.Right - info.Monitor.Left;
        var height = info.Monitor.Bottom - info.Monitor.Top;
        if (mode == "borderless")
        {
            AspectFit16By9(info.Monitor, out x, out y, out width, out height);
        }
        SetWindowPos(
            hwnd,
            IntPtr.Zero,
            x,
            y,
            width,
            height,
            SwpFrameChanged | SwpShowWindow);
        AppendLog(paths.LauncherLog, "display mode applied: " + mode);
    }

    private static void ApplyCursorClip(RuntimePaths paths, Process client, string mode, string policy)
    {
        if (!ShouldClipCursor(mode, policy))
        {
            ReleaseCursorClip(paths);
            AppendLog(paths.LauncherLog, "cursor clip disabled: mode=" + mode + " policy=" + policy);
            return;
        }
        var hwnd = WaitForMainWindow(client, 10000);
        if (hwnd == IntPtr.Zero)
        {
            AppendLog(paths.LauncherLog, "cursor clip skipped: client window not found");
            return;
        }
        Rect rect;
        if (!TryGetClientScreenRect(hwnd, out rect))
        {
            AppendLog(paths.LauncherLog, "cursor clip skipped: client rect unavailable");
            return;
        }
        if (!ClipCursor(ref rect))
        {
            AppendLog(paths.LauncherLog, "cursor clip failed");
            return;
        }
        AppendLog(paths.LauncherLog, "cursor clip applied: " + rect.Left + "," + rect.Top + "," + rect.Right + "," + rect.Bottom);
    }

    private static bool ShouldClipCursor(string mode, string policy)
    {
        if (policy == "on")
        {
            return true;
        }
        if (policy == "off")
        {
            return false;
        }
        return mode == "borderless" || mode == "fullscreen";
    }

    private static bool TryGetClientScreenRect(IntPtr hwnd, out Rect rect)
    {
        rect = new Rect();
        if (!GetClientRect(hwnd, out rect))
        {
            return false;
        }
        var topLeft = new NativePoint { X = rect.Left, Y = rect.Top };
        var bottomRight = new NativePoint { X = rect.Right, Y = rect.Bottom };
        if (!ClientToScreen(hwnd, ref topLeft) || !ClientToScreen(hwnd, ref bottomRight))
        {
            return false;
        }
        rect.Left = topLeft.X;
        rect.Top = topLeft.Y;
        rect.Right = bottomRight.X;
        rect.Bottom = bottomRight.Y;
        return rect.Right > rect.Left && rect.Bottom > rect.Top;
    }

    private static void ReleaseCursorClip(RuntimePaths paths)
    {
        if (ClipCursor(IntPtr.Zero))
        {
            AppendLog(paths.LauncherLog, "cursor clip released");
        }
    }

    private static void AspectFit16By9(Rect rect, out int x, out int y, out int width, out int height)
    {
        var monitorWidth = Math.Max(1, rect.Right - rect.Left);
        var monitorHeight = Math.Max(1, rect.Bottom - rect.Top);
        width = monitorWidth;
        height = (width * 9) / 16;
        if (height > monitorHeight)
        {
            height = monitorHeight;
            width = (height * 16) / 9;
        }
        x = rect.Left + ((monitorWidth - width) / 2);
        y = rect.Top + ((monitorHeight - height) / 2);
    }

    private static IntPtr WaitForMainWindow(Process client, int timeoutMs)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            if (client.HasExited)
            {
                return IntPtr.Zero;
            }
            client.Refresh();
            if (client.MainWindowHandle != IntPtr.Zero)
            {
                return client.MainWindowHandle;
            }
            Thread.Sleep(100);
        }
        return IntPtr.Zero;
    }

    private static void WaitForClientSmoke(RuntimePaths paths, Process client)
    {
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (DateTime.UtcNow < deadline)
        {
            if (client.HasExited)
            {
                throw new InvalidOperationException(
                    "game client exited early during smoke with code " + client.ExitCode + "; see " + paths.LauncherLog);
            }
            Thread.Sleep(250);
        }
        AppendLog(paths.LauncherLog, "client smoke survived 5 seconds");
    }

    private static void WaitForServer(RuntimePaths paths, Process server)
    {
        var deadline = DateTime.UtcNow.AddSeconds(12);
        while (DateTime.UtcNow < deadline)
        {
            if (server.HasExited)
            {
                throw new InvalidOperationException("local server exited early; see " + paths.ServerLog);
            }
            if (IsPortOpen(Host, Port, 250))
            {
                return;
            }
            Thread.Sleep(150);
        }
        throw new TimeoutException("local server did not listen on " + Host + ":" + Port);
    }

    private static bool IsPortOpen(string host, int port, int timeoutMs)
    {
        try
        {
            using (var client = new TcpClient())
            {
                var result = client.BeginConnect(host, port, null, null);
                if (!result.AsyncWaitHandle.WaitOne(timeoutMs))
                {
                    return false;
                }
                client.EndConnect(result);
                return true;
            }
        }
        catch (SocketException)
        {
            return false;
        }
        catch (ObjectDisposedException)
        {
            return false;
        }
    }

    private static void KillProcess(Process process)
    {
        if (process == null)
        {
            return;
        }
        try
        {
            if (!process.HasExited)
            {
                process.Kill();
                process.WaitForExit(3000);
            }
        }
        catch (InvalidOperationException)
        {
        }
    }

    private static string Quote(string value)
    {
        if (value.Length == 0)
        {
            return "\"\"";
        }

        var builder = new StringBuilder();
        builder.Append('"');
        var backslashes = 0;
        for (var i = 0; i < value.Length; i += 1)
        {
            var ch = value[i];
            if (ch == '\\')
            {
                backslashes += 1;
                continue;
            }
            if (ch == '"')
            {
                builder.Append('\\', (backslashes * 2) + 1);
                builder.Append('"');
                backslashes = 0;
                continue;
            }
            if (backslashes > 0)
            {
                builder.Append('\\', backslashes);
                backslashes = 0;
            }
            builder.Append(ch);
        }
        if (backslashes > 0)
        {
            builder.Append('\\', backslashes * 2);
        }
        builder.Append('"');
        return builder.ToString();
    }

    private static void AppendLog(string path, string line)
    {
        lock (LogLock)
        {
            File.AppendAllText(path, "[" + DateTime.Now.ToString("s") + "] " + line + Environment.NewLine);
        }
    }

    private static void WriteAutomationLine(string line)
    {
        var text = line + Environment.NewLine;
        if (TryWriteInheritedStdout(text))
        {
            return;
        }
        try
        {
            Console.Out.Write(text);
        }
        catch (IOException)
        {
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private static bool TryWriteInheritedStdout(string text)
    {
        var handle = GetStdHandle(StdOutputHandle);
        if (handle == IntPtr.Zero || handle == InvalidHandleValue)
        {
            return false;
        }
        var bytes = Encoding.UTF8.GetBytes(text);
        if (bytes.Length == 0)
        {
            return true;
        }
        uint written;
        return WriteFile(handle, bytes, (uint)bytes.Length, out written, IntPtr.Zero) && written > 0;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool WriteFile(
        IntPtr hFile,
        byte[] lpBuffer,
        uint nNumberOfBytesToWrite,
        out uint lpNumberOfBytesWritten,
        IntPtr lpOverlapped);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string lpApplicationName,
        StringBuilder lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref StartupInfo lpStartupInfo,
        out ProcessInformation lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool WriteProfileString(string lpszSection, string lpszKeyName, string lpszString);

    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int AddFontResourceEx(string lpszFilename, uint fl, IntPtr pdv);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        uint Msg,
        UIntPtr wParam,
        string lParam,
        uint fuFlags,
        uint uTimeout,
        out UIntPtr lpdwResult);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetMenu(IntPtr hWnd, IntPtr hMenu);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        int uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MonitorInfo lpmi);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetClientRect(IntPtr hWnd, out Rect lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ClientToScreen(IntPtr hWnd, ref NativePoint lpPoint);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ClipCursor(ref Rect lpRect);

    [DllImport("user32.dll", EntryPoint = "ClipCursor", SetLastError = true)]
    private static extern bool ClipCursor(IntPtr lpRect);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MonitorInfo
    {
        public int Size;
        public Rect Monitor;
        public Rect WorkArea;
        public uint Flags;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size;
        public string Reserved;
        public string Desktop;
        public string Title;
        public int X;
        public int Y;
        public int XSize;
        public int YSize;
        public int XCountChars;
        public int YCountChars;
        public int FillAttribute;
        public int Flags;
        public short ShowWindow;
        public short Reserved2;
        public IntPtr Reserved2Pointer;
        public IntPtr StdInput;
        public IntPtr StdOutput;
        public IntPtr StdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        public IntPtr Process;
        public IntPtr Thread;
        public int ProcessId;
        public int ThreadId;
    }

    private sealed class SignupResult
    {
        public readonly bool Ok;
        public readonly string Message;

        private SignupResult(bool ok, string message)
        {
            Ok = ok;
            Message = message;
        }

        public static SignupResult Success(string message)
        {
            return new SignupResult(true, message);
        }

        public static SignupResult Fail(string message)
        {
            return new SignupResult(false, message);
        }
    }

    private sealed class AdminCommandResult
    {
        public readonly int ExitCode;
        public readonly string Stdout;
        public readonly string Stderr;

        public AdminCommandResult(int exitCode, string stdout, string stderr)
        {
            ExitCode = exitCode;
            Stdout = stdout ?? "";
            Stderr = stderr ?? "";
        }

        public string OutputText
        {
            get { return (Stderr + Environment.NewLine + Stdout).Trim(); }
        }
    }

    private sealed class SignupForm : Form
    {
        private readonly RuntimePaths _paths;
        private readonly TextBox _account;
        private readonly TextBox _password;
        private readonly Button _submit;
        private readonly Label _message;

        public int ExitCode { get; private set; }

        public SignupForm(RuntimePaths paths)
        {
            _paths = paths;
            ExitCode = 0;
            Text = "LOGH VII 계정 회원가입";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(400, 245);

            var title = new Label();
            title.Text = "LOGH VII 계정 회원가입";
            title.Font = new Font(Font.FontFamily, 12, FontStyle.Bold);
            title.Location = new Point(22, 18);
            title.Size = new Size(350, 24);
            Controls.Add(title);

            var help = new Label();
            help.Text = "게임 로그인에 사용할 계정과 비밀번호를 등록합니다.";
            help.Location = new Point(22, 46);
            help.Size = new Size(350, 20);
            Controls.Add(help);

            var accountLabel = new Label();
            accountLabel.Text = "계정 ID";
            accountLabel.Location = new Point(22, 80);
            accountLabel.Size = new Size(90, 20);
            Controls.Add(accountLabel);

            _account = new TextBox();
            _account.Location = new Point(118, 78);
            _account.Size = new Size(250, 22);
            _account.MaxLength = 32;
            Controls.Add(_account);

            var passwordLabel = new Label();
            passwordLabel.Text = "비밀번호";
            passwordLabel.Location = new Point(22, 118);
            passwordLabel.Size = new Size(90, 20);
            Controls.Add(passwordLabel);

            _password = new TextBox();
            _password.Location = new Point(118, 116);
            _password.Size = new Size(250, 22);
            _password.UseSystemPasswordChar = true;
            Controls.Add(_password);

            _submit = new Button();
            _submit.Text = "등록";
            _submit.Location = new Point(118, 156);
            _submit.Size = new Size(120, 32);
            _submit.Click += OnSubmit;
            Controls.Add(_submit);

            _message = new Label();
            _message.Location = new Point(22, 204);
            _message.Size = new Size(350, 30);
            Controls.Add(_message);

            AcceptButton = _submit;
        }

        private void OnSubmit(object sender, EventArgs eventArgs)
        {
            _submit.Enabled = false;
            _message.Text = "";
            try
            {
                var result = RegisterAccount(_paths, _account.Text.Trim(), _password.Text);
                if (result.Ok)
                {
                    _message.ForeColor = Color.DarkGreen;
                    _message.Text = result.Message;
                    AppendLog(_paths.LauncherLog, "signup completed for account " + _account.Text.Trim());
                    MessageBox.Show(result.Message, "회원가입", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    Close();
                    return;
                }
                ExitCode = 1;
                _message.ForeColor = Color.Firebrick;
                _message.Text = result.Message;
            }
            finally
            {
                if (!IsDisposed)
                {
                    _submit.Enabled = true;
                }
            }
        }
    }
}

public sealed class RuntimePaths
{
    public string Root;
    public string RuntimeRoot;
    public string SupportDir;
    public string ClientDir;
    public string ClientExe;
    public string PlayerLauncherExe;
    public string LegacyLauncherExe;
    public string ServerEntry;
    public string StateDir;
    public string LogDir;
    public string TraceDir;
    public string ServerLog;
    public string LauncherLog;
    public string UpdaterLog;
    public string TracePath;
    public string AccountDb;
    public string SessionDb;
    public string WorldStateDb;
    public string AdminTokenFile;
    public string StringFile;
    public string StringBackup;
    public string DgVoodooConfig;
    public string FontsDir;
    public string FontInstallScript;
    public string UpdateScript;
    public string PackageManifest;
    public string NodeExe;
    public bool HasLocalServerRuntime;

    public static RuntimePaths Create(string baseDirectory)
    {
        var root = Path.GetFullPath(baseDirectory);
        var runtime = Path.Combine(root, "logh7-runtime");
        var support = Path.Combine(root, "_support");
        var paths = new RuntimePaths();
        paths.Root = root;
        paths.RuntimeRoot = runtime;
        paths.SupportDir = support;
        paths.ClientDir = Path.Combine(root, "exe");
        paths.ClientExe = Path.Combine(paths.ClientDir, "G7MTClient.exe");
        paths.PlayerLauncherExe = Path.Combine(root, "은하영웅전설7.exe");
        paths.LegacyLauncherExe = Path.Combine(root, "G7Start.exe");
        paths.ServerEntry = Path.Combine(runtime, "src", "server", "logh7-server.mjs");
        paths.HasLocalServerRuntime = File.Exists(paths.ServerEntry);
        paths.StateDir = Path.Combine(paths.HasLocalServerRuntime ? runtime : support, "state");
        paths.LogDir = Path.Combine(paths.HasLocalServerRuntime ? runtime : support, "logs");
        paths.TraceDir = Path.Combine(paths.HasLocalServerRuntime ? runtime : support, "traces");
        paths.ServerLog = Path.Combine(paths.LogDir, "server.log");
        paths.LauncherLog = Path.Combine(paths.LogDir, "launcher.log");
        paths.UpdaterLog = Path.Combine(paths.LogDir, "updater.log");
        paths.TracePath = Path.Combine(paths.TraceDir, "live-trace.jsonl");
        paths.AccountDb = Path.Combine(paths.StateDir, "accounts.sqlite");
        paths.SessionDb = Path.Combine(paths.StateDir, "lobby-sessions.sqlite");
        paths.WorldStateDb = Path.Combine(paths.StateDir, "world-state.sqlite");
        paths.AdminTokenFile = Path.Combine(paths.StateDir, "admin-token.txt");
        paths.StringFile = Path.Combine(paths.ClientDir, "String.txt");
        paths.StringBackup = Path.Combine(paths.ClientDir, "String.txt.original");
        paths.DgVoodooConfig = Path.Combine(paths.ClientDir, "dgVoodoo.conf");
        paths.FontsDir = Path.Combine(root, "fonts");
        paths.FontInstallScript = Path.Combine(root, "tools", "packaging", "install-pretendard.ps1");
        paths.UpdateScript = Path.Combine(support, "update-client.ps1");
        paths.PackageManifest = Path.Combine(root, "client-package-manifest.json");
        paths.NodeExe = FindNode(root);
        return paths;
    }

    public void Validate()
    {
        RequireFile(ClientExe, "client executable");
        if (HasLocalServerRuntime)
        {
            RequireFile(ServerEntry, "server entry");
            RequireFile(NodeExe, "node.exe");
        }
    }

    private static void RequireFile(string path, string label)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("missing " + label + ": " + path);
        }
    }

    private static string FindNode(string root)
    {
        var env = Environment.GetEnvironmentVariable("LOGH7_NODE");
        if (!String.IsNullOrEmpty(env) && File.Exists(env))
        {
            return env;
        }
        var bundled = Path.Combine(root, "logh7-runtime", "node", "node.exe");
        if (File.Exists(bundled))
        {
            return bundled;
        }
        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in path.Split(Path.PathSeparator))
        {
            if (String.IsNullOrWhiteSpace(dir))
            {
                continue;
            }
            var candidate = Path.Combine(dir.Trim(), "node.exe");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        return "node.exe";
    }
}
