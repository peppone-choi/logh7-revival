// Logh7FullExport.java -- full RE index export for a LOGH VII binary.
// Exports EVERY function's decompiled C (functions.jsonl), all defined strings
// (strings.tsv), and imports/exports (symbols.tsv) into a grep-friendly tree, so
// future modding/protocol/asset work is a search instead of a manual disasm.
//
// Usage (headless): -postScript Logh7FullExport.java <outDir>
//@category LOGH7
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.decompiler.DecompiledFunction;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.FunctionManager;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.DataIterator;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;
import ghidra.program.model.symbol.SymbolTable;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

public class Logh7FullExport extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        String outDir = (args.length > 0) ? args[0] : "logh7-export";
        File dir = new File(outDir);
        dir.mkdirs();
        println("Logh7FullExport -> " + dir.getAbsolutePath());

        exportFunctions(dir);
        exportStrings(dir);
        exportSymbols(dir);
        println("Logh7FullExport DONE");
    }

    private void exportFunctions(File dir) throws Exception {
        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);
        decomp.setSimplificationStyle("decompile");
        PrintWriter fw = newWriter(new File(dir, "functions.jsonl"));
        FunctionManager fm = currentProgram.getFunctionManager();
        FunctionIterator it = fm.getFunctions(true);
        int count = 0, ok = 0;
        while (it.hasNext() && !monitor.isCancelled()) {
            Function f = it.next();
            count++;
            String addr = f.getEntryPoint().toString();
            String name = f.getName();
            String sig;
            try { sig = f.getPrototypeString(false, false); } catch (Exception e) { sig = name + "()"; }
            String c = "";
            try {
                DecompileResults r = decomp.decompileFunction(f, 45, monitor);
                if (r != null && r.decompileCompleted()) {
                    DecompiledFunction df = r.getDecompiledFunction();
                    if (df != null) { c = df.getC(); ok++; }
                }
            } catch (Exception e) {
                c = "/* decompile error: " + e.getMessage() + " */";
            }
            StringBuilder sb = new StringBuilder(256);
            sb.append("{\"addr\":\"0x").append(addr).append("\",\"name\":").append(j(name))
              .append(",\"sig\":").append(j(sig)).append(",\"c\":").append(j(c)).append("}");
            fw.println(sb.toString());
            if (count % 500 == 0) { println("functions decompiled: " + count); fw.flush(); }
        }
        fw.close();
        decomp.dispose();
        println("functions total=" + count + " decompiled=" + ok);
    }

    private void exportStrings(File dir) throws Exception {
        PrintWriter sw = newWriter(new File(dir, "strings.tsv"));
        DataIterator di = currentProgram.getListing().getDefinedData(true);
        int n = 0;
        while (di.hasNext() && !monitor.isCancelled()) {
            Data d = di.next();
            Object v;
            try { v = d.getValue(); } catch (Exception e) { continue; }
            if (v instanceof String) {
                String s = ((String) v).replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r");
                sw.println("0x" + d.getAddress().toString() + "\t" + s);
                n++;
            }
        }
        sw.close();
        println("strings=" + n);
    }

    private void exportSymbols(File dir) throws Exception {
        PrintWriter yw = newWriter(new File(dir, "symbols.tsv"));
        SymbolTable st = currentProgram.getSymbolTable();
        SymbolIterator ext = st.getExternalSymbols();
        int imp = 0;
        while (ext.hasNext()) {
            Symbol s = ext.next();
            yw.println("import\t" + s.getParentNamespace().getName() + "\t" + s.getName() + "\t0x" + s.getAddress().toString());
            imp++;
        }
        SymbolIterator all = st.getAllSymbols(true);
        int lbl = 0;
        while (all.hasNext() && !monitor.isCancelled()) {
            Symbol s = all.next();
            if (s.isExternal()) continue;
            if (s.getSource() != null && s.getSource().toString().equals("DEFAULT")) continue;
            yw.println("symbol\t" + s.getName() + "\t0x" + s.getAddress().toString());
            lbl++;
            if (lbl > 200000) break;
        }
        yw.close();
        println("imports=" + imp + " symbols=" + lbl);
    }

    private static PrintWriter newWriter(File f) throws Exception {
        return new PrintWriter(new OutputStreamWriter(new FileOutputStream(f), StandardCharsets.UTF_8));
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
                default:
                    if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch));
                    else b.append(ch);
            }
        }
        b.append('"');
        return b.toString();
    }
}
