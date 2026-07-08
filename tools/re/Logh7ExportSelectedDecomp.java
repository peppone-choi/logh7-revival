import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

public class Logh7ExportSelectedDecomp extends GhidraScript {
    private static String safeName(String value) {
        return value.replaceAll("[^0-9A-Za-z_.-]+", "_");
    }

    private static String json(String value) {
        if (value == null) {
            return "null";
        }
        String escaped = value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\r", "\\r")
            .replace("\n", "\\n");
        return "\"" + escaped + "\"";
    }

    private static void field(PrintWriter out, String name, String value, boolean comma) {
        out.print(json(name));
        out.print(":");
        out.print(json(value));
        if (comma) {
            out.print(",");
        }
    }

    private static void field(PrintWriter out, String name, boolean value, boolean comma) {
        out.print(json(name));
        out.print(":");
        out.print(value ? "true" : "false");
        if (comma) {
            out.print(",");
        }
    }

    private static void field(PrintWriter out, String name, long value, boolean comma) {
        out.print(json(name));
        out.print(":");
        out.print(value);
        if (comma) {
            out.print(",");
        }
    }

    private static void writeText(File path, String text) throws Exception {
        try (PrintWriter out = new PrintWriter(new OutputStreamWriter(new FileOutputStream(path), StandardCharsets.UTF_8))) {
            out.print(text == null ? "" : text);
        }
    }

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) {
            throw new IllegalArgumentException("usage: Logh7ExportSelectedDecomp.java <out_dir> <va> [<va>...]");
        }

        File outDir = new File(args[0]);
        outDir.mkdirs();

        DecompInterface iface = new DecompInterface();
        iface.openProgram(currentProgram);
        FunctionManager functions = currentProgram.getFunctionManager();
        File manifestPath = new File(outDir, "selected-decomp-manifest.jsonl");

        try (PrintWriter manifest = new PrintWriter(new OutputStreamWriter(new FileOutputStream(manifestPath), StandardCharsets.UTF_8))) {
            for (int i = 1; i < args.length; i++) {
                String raw = args[i];
                Address address = toAddr(raw);
                Function fn = functions.getFunctionAt(address);
                if (fn == null) {
                    fn = functions.getFunctionContaining(address);
                }

                manifest.print("{");
                field(manifest, "query", raw, true);
                field(manifest, "address", String.format("0x%x", address.getOffset()), true);
                field(manifest, "program", currentProgram.getName(), true);
                field(manifest, "found", fn != null, false);

                if (fn != null) {
                    DecompileResults result = iface.decompileFunction(fn, 120, monitor);
                    boolean ok = result.decompileCompleted();
                    String entry = String.format("0x%x", fn.getEntryPoint().getOffset());
                    String outName = entry + "_" + safeName(fn.getName()) + ".c";
                    File outPath = new File(outDir, outName);
                    writeText(outPath, ok ? result.getDecompiledFunction().getC() : "");

                    manifest.print(",");
                    field(manifest, "name", fn.getName(), true);
                    field(manifest, "entry", entry, true);
                    field(manifest, "size", fn.getBody().getNumAddresses(), true);
                    field(manifest, "decompileOk", ok, true);
                    field(manifest, "error", ok ? "" : result.getErrorMessage(), true);
                    field(manifest, "outPath", outPath.getAbsolutePath(), false);
                }

                manifest.println("}");
            }
        }
    }
}
