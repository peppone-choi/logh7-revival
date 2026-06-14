import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSetView;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class Logh7FocusDump extends GhidraScript {
    private static final int DECOMPILE_TIMEOUT_SECONDS = 45;

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) {
            throw new IllegalArgumentException("usage: Logh7FocusDump.java <out.json> <0xaddr:label>...");
        }

        File outputFile = new File(args[0]);
        File parent = outputFile.getParentFile();
        if (parent != null) {
            parent.mkdirs();
        }

        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        List<String> functionJson = new ArrayList<>();
        for (int index = 1; index < args.length; index++) {
            functionJson.add(dumpFunction(args[index], decompiler));
        }
        decompiler.dispose();

        StringBuilder out = new StringBuilder();
        out.append("{\n");
        appendField(out, "programName", currentProgram.getName(), true, 1);
        appendField(out, "imageBaseHex", currentProgram.getImageBase().toString(), true, 1);
        out.append("  \"functions\": [\n");
        for (int index = 0; index < functionJson.size(); index++) {
            out.append(functionJson.get(index));
            if (index + 1 < functionJson.size()) {
                out.append(",");
            }
            out.append("\n");
        }
        out.append("  ]\n");
        out.append("}\n");

        try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(outputFile), StandardCharsets.UTF_8)) {
            writer.write(out.toString());
        }
    }

    private String dumpFunction(String spec, DecompInterface decompiler) throws Exception {
        String[] parts = spec.split(":", 2);
        Address requested = toAddress(parts[0]);
        String label = parts.length == 2 ? parts[1] : parts[0];
        Function function = findOrCreateFunction(requested, label);

        StringBuilder out = new StringBuilder();
        out.append("    {\n");
        appendField(out, "label", label, true, 3);
        appendField(out, "requestedAddressHex", requested.toString(), true, 3);
        appendField(out, "found", function != null ? "true" : "false", false, 3);
        if (function == null) {
            removeTrailingComma(out);
            out.append("\n    }");
            return out.toString();
        }

        appendField(out, "functionName", function.getName(), true, 3);
        appendField(out, "entryPointHex", function.getEntryPoint().toString(), true, 3);
        appendField(out, "bodyRanges", joinBodyRanges(function.getBody()), true, 3);
        appendStringArray(out, "callers", functionNames(function.getCallingFunctions(monitor)), 3);
        appendStringArray(out, "callees", functionNames(function.getCalledFunctions(monitor)), 3);
        appendStringArray(out, "referencesToRequestedAddress", referencesTo(requested), 3);

        DecompileResults results = decompiler.decompileFunction(function, DECOMPILE_TIMEOUT_SECONDS, monitor);
        String decompiled = "";
        if (results.decompileCompleted() && results.getDecompiledFunction() != null) {
            decompiled = results.getDecompiledFunction().getC();
        }
        appendField(out, "decompiledC", decompiled, true, 3);
        removeTrailingComma(out);
        out.append("\n    }");
        return out.toString();
    }

    private Address toAddress(String value) {
        long parsed = Long.decode(value);
        return currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(parsed);
    }

    private Function findOrCreateFunction(Address requested, String label) throws Exception {
        Function function = getFunctionAt(requested);
        if (function != null) {
            return function;
        }
        function = getFunctionContaining(requested);
        if (function != null) {
            return function;
        }
        disassemble(requested);
        function = createFunction(requested, "focus_" + label);
        if (function != null) {
            return function;
        }
        return getFunctionContaining(requested);
    }

    private List<String> functionNames(Iterable<Function> functions) {
        List<String> names = new ArrayList<>();
        for (Function function : functions) {
            names.add(function.getEntryPoint().toString() + ":" + function.getName());
        }
        return names;
    }

    private List<String> referencesTo(Address address) {
        List<String> refs = new ArrayList<>();
        ReferenceIterator iterator = currentProgram.getReferenceManager().getReferencesTo(address);
        while (iterator.hasNext()) {
            Reference ref = iterator.next();
            refs.add(ref.getFromAddress().toString() + ":" + ref.getReferenceType().getName());
        }
        return refs;
    }

    private String joinBodyRanges(AddressSetView body) {
        StringBuilder joined = new StringBuilder();
        body.forEach(range -> {
            if (joined.length() > 0) {
                joined.append(",");
            }
            joined.append(range.getMinAddress().toString());
            joined.append("-");
            joined.append(range.getMaxAddress().toString());
        });
        return joined.toString();
    }

    private void appendStringArray(StringBuilder out, String name, List<String> values, int indent) {
        indent(out, indent);
        out.append("\"").append(name).append("\": [");
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                out.append(", ");
            }
            out.append("\"").append(escape(values.get(index))).append("\"");
        }
        out.append("],\n");
    }

    private void appendField(StringBuilder out, String name, String value, boolean quoted, int indent) {
        indent(out, indent);
        out.append("\"").append(name).append("\": ");
        if (quoted) {
            out.append("\"").append(escape(value)).append("\"");
        } else {
            out.append(value);
        }
        out.append(",\n");
    }

    private void indent(StringBuilder out, int count) {
        for (int index = 0; index < count; index++) {
            out.append("  ");
        }
    }

    private void removeTrailingComma(StringBuilder out) {
        for (int index = out.length() - 1; index >= 0; index--) {
            char item = out.charAt(index);
            if (item == ',') {
                out.deleteCharAt(index);
                return;
            }
            if (!Character.isWhitespace(item)) {
                return;
            }
        }
    }

    private String escape(String value) {
        StringBuilder escaped = new StringBuilder();
        for (int index = 0; index < value.length(); index++) {
            char item = value.charAt(index);
            switch (item) {
                case '\\':
                    escaped.append("\\\\");
                    break;
                case '"':
                    escaped.append("\\\"");
                    break;
                case '\n':
                    escaped.append("\\n");
                    break;
                case '\r':
                    escaped.append("\\r");
                    break;
                case '\t':
                    escaped.append("\\t");
                    break;
                default:
                    if (item < 0x20) {
                        escaped.append(String.format("\\u%04x", (int) item));
                    } else {
                        escaped.append(item);
                    }
                    break;
            }
        }
        return escaped.toString();
    }
}
