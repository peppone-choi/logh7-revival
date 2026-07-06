# Ghidra Jython post-analysis export script
# Dumps: functions.jsonl, data-symbols.tsv, and xrefs to candidate galaxy strings/constmsg ids
import json
from ghidra.program.model.symbol import RefType

fm = currentProgram.getFunctionManager()
listing = currentProgram.getListing()
memory = currentProgram.getMemory()
refmgr = currentProgram.getReferenceManager()
symtab = currentProgram.getSymbolTable()
out_dir = r"E:\logh7-revival\.omo\re-galaxy"

# 1) functions dump
with open(out_dir + r"\functions.jsonl", "w") as f:
    for fn in fm.getFunctions(True):
        e = fn.getEntryPoint()
        body = fn.getBody()
        f.write(json.dumps({
            "name": fn.getName(),
            "entry": "0x%x" % e.getOffset(),
            "size": body.getNumAddresses(),
        }) + "\n")

# 2) defined data symbols with values (candidate tables)
with open(out_dir + r"\data-symbols.tsv", "w") as f:
    di = listing.getDefinedData(True)
    for d in di:
        addr = d.getAddress()
        dt = d.getDataType().getName()
        blk = memory.getBlock(addr)
        blkname = blk.getName() if blk else "?"
        try:
            val = d.getDefaultValueRepresentation()
        except:
            val = ""
        f.write("0x%x\t%s\t%s\t%s\n" % (addr.getOffset(), blkname, dt, val[:80]))

# 3) find string references to galaxy/system/planet keywords
keywords = ["galaxy","system","planet","star","Null_galaxy","seikei","wakusei",
            "grid","MAP","map_","cluster","sector","coord"]
hits = []
di = currentProgram.getListing().getDefinedData(True)
for d in di:
    try:
        v = d.getValue()
    except:
        continue
    if v is None: continue
    s = str(v)
    low = s.lower()
    for kw in keywords:
        if kw.lower() in low:
            addr = d.getAddress()
            refs = refmgr.getReferencesTo(addr)
            reflist = []
            for r in refs:
                reflist.append("0x%x" % r.getFromAddress().getOffset())
            hits.append({"addr":"0x%x"%addr.getOffset(),"str":s[:100],"refs":reflist})
            break
with open(out_dir + r"\string-hits.json","w") as f:
    json.dump(hits, f, indent=1)

print("EXPORT DONE: %d string hits" % len(hits))
