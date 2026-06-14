// Logh7DumpAddrs.java -- force-create + decompile functions at specific addresses (vtable-only
// targets that auto-analysis missed), appending JSONL records compatible with functions.jsonl.
// Run via -process on the saved project (no re-analysis): fast on-demand fill of index gaps.
//
// Usage (headless): -postScript Logh7DumpAddrs.java <outFile> 0xADDR1 0xADDR2 ...
//@category LOGH7
import ghidra.app.script.GhidraScript;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.decompiler.DecompiledFunction;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

public class Logh7DumpAddrs extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) { println("need <outFile> <addr...>"); return; }
        File out = new File(args[0]);
        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);
        decomp.setSimplificationStyle("decompile");
        PrintWriter w = new PrintWriter(new OutputStreamWriter(new FileOutputStream(out), StandardCharsets.UTF_8));
        for (int i = 1; i < args.length; i++) {
            String as = args[i];
            Address a;
            try { a = toAddr(as.startsWith("0x") ? as.substring(2) : as); } catch (Exception e) { println("bad addr " + as); continue; }
            Function f = getFunctionAt(a);
            if (f == null) {
                new DisassembleCommand(a, null, true).applyTo(currentProgram, monitor);
                new CreateFunctionCmd(a).applyTo(currentProgram, monitor);
                f = getFunctionAt(a);
            }
            if (f == null) { println("could not create function at " + as); continue; }
            String name = f.getName();
            String sig; try { sig = f.getPrototypeString(false, false); } catch (Exception e) { sig = name + "()"; }
            String c = "";
            try {
                DecompileResults r = decomp.decompileFunction(f, 60, monitor);
                if (r != null && r.decompileCompleted()) { DecompiledFunction df = r.getDecompiledFunction(); if (df != null) c = df.getC(); }
            } catch (Exception e) { c = "/* decompile error: " + e.getMessage() + " */"; }
            w.println("{\"addr\":\"0x" + f.getEntryPoint().toString() + "\",\"name\":" + j(name) + ",\"sig\":" + j(sig) + ",\"c\":" + j(c) + "}");
            println("dumped " + as + " -> " + f.getEntryPoint().toString() + " " + name);
        }
        w.close();
        decomp.dispose();
        println("Logh7DumpAddrs DONE");
    }

    private static String j(String s) {
        if (s == null) return "\"\"";
        StringBuilder b = new StringBuilder(s.length() + 8);
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '\\': b.append("\\\\"); break;
                case '"': b.append("\\\""); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default: if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch)); else b.append(ch);
            }
        }
        b.append('"');
        return b.toString();
    }
}
