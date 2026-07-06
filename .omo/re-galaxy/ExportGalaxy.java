// Java GhidraScript: locate galaxy/planet loaders + KV parser, dump xrefs & decompiled callers
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.data.StringDataInstance;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.app.decompiler.*;
import java.io.*;
import java.util.*;

public class ExportGalaxy extends GhidraScript {
    public void run() throws Exception {
        String OUT = "E:\\logh7-revival\\.omo\\re-galaxy\\";
        Listing listing = currentProgram.getListing();
        ReferenceManager rm = currentProgram.getReferenceManager();
        FunctionManager fm = currentProgram.getFunctionManager();

        // target strings to locate (case-insensitive substring match on defined data)
        String[] targets = {"galaxy.mdx","null_galaxy","p%03d_low.mdx","fs%03d_low.mdx",
            "fixedstar=","planet_num=","class_=","revolution_radius=","habitability=",
            "area=","grid_index=","start_year="};
        Map<String,List<Long>> strAddr = new LinkedHashMap<>();
        for (String t: targets) strAddr.put(t, new ArrayList<Long>());

        DataIterator di = listing.getDefinedData(true);
        while (di.hasNext()) {
            Data d = di.next();
            Object v = d.getValue();
            if (v == null) continue;
            String s = v.toString();
            for (String t: targets) {
                if (s.equals(t) || s.contains(t)) strAddr.get(t).add(d.getAddress().getOffset());
            }
        }

        // collect referencing functions
        DecompInterface dec = new DecompInterface();
        dec.openProgram(currentProgram);
        PrintWriter xr = new PrintWriter(new FileWriter(OUT+"galaxy-xrefs.txt"));
        Set<Function> toDecomp = new LinkedHashSet<>();
        for (String t: targets) {
            xr.println("### STRING "+t+" -> "+strAddr.get(t).size()+" instance(s)");
            for (long off: strAddr.get(t)) {
                Address a = toAddr(off);
                xr.println("  data @ 0x"+Long.toHexString(off));
                ReferenceIterator ri = rm.getReferencesTo(a);
                while (ri.hasNext()) {
                    Reference r = ri.next();
                    Address from = r.getFromAddress();
                    Function f = fm.getFunctionContaining(from);
                    xr.println("     xref from 0x"+Long.toHexString(from.getOffset())+
                        (f!=null?("  in "+f.getName()+" @0x"+Long.toHexString(f.getEntryPoint().getOffset())):"  (no func)"));
                    if (f!=null) toDecomp.add(f);
                }
            }
        }
        xr.close();

        PrintWriter dc = new PrintWriter(new FileWriter(OUT+"galaxy-decomp.c"));
        int n=0;
        for (Function f: toDecomp) {
            if (n++>40) { dc.println("// ...truncated at 40 funcs"); break; }
            DecompileResults res = dec.decompileFunction(f, 60, monitor);
            dc.println("// ===== "+f.getName()+" @0x"+Long.toHexString(f.getEntryPoint().getOffset())+" =====");
            if (res!=null && res.decompileCompleted())
                dc.println(res.getDecompiledFunction().getC());
            else dc.println("// decompile failed");
        }
        dc.close();

        // dump function list
        PrintWriter fl = new PrintWriter(new FileWriter(OUT+"functions.tsv"));
        FunctionIterator fi = fm.getFunctions(true);
        int cnt=0;
        while (fi.hasNext()) { Function f=fi.next(); fl.println("0x"+Long.toHexString(f.getEntryPoint().getOffset())+"\t"+f.getName()+"\t"+f.getBody().getNumAddresses()); cnt++; }
        fl.close();
        println("EXPORT DONE funcs="+cnt+" decomp="+Math.min(n,41)+" xref-funcs="+toDecomp.size());
    }
}
