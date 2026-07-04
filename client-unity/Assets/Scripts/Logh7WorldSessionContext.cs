// G063: 씬 간 월드 세션 전달용 컨텍스트 (서버가 승인한 세션만 세팅됨).
public static class Logh7WorldSessionContext
{
    public static Logh7WorldSessionInfo Current { get; private set; }

    public static void Set(Logh7WorldSessionInfo session)
    {
        Current = session;
    }

    public static void Clear()
    {
        Current = null;
    }
}
