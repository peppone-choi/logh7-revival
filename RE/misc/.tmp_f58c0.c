// EXACT  0x004f58c0  FUN_004f58c0  undefined FUN_004f58c0()

void __thiscall FUN_004f58c0(int *param_1,undefined1 *param_2)

{
  undefined4 *puVar1;
  int iVar2;
  char cVar3;
  int iVar4;
  int iVar5;
  uint uVar6;
  int *local_38;
  undefined1 local_34 [52];
  
  if ((*param_1 != 0) && (iVar4 = FUN_0050cf40(0x65), iVar4 != 0)) {
    *param_2 = 0;
    if ((*(char *)(*param_1 + 4) != '\0') && ((param_1[0xd5] < 0 && (iVar4 = 0, 0 < param_1[0xd4])))
       ) {
      local_38 = param_1 + 0xc;
      do {
        puVar1 = (undefined4 *)*local_38;
        cVar3 = FUN_005015f0(2,puVar1,local_34,0);
        if (cVar3 != '\0') {
          param_1[0xd5] = iVar4;
          if ((iVar4 < 0) || (0x17 < iVar4)) {
            uVar6 = 0xffffffff;
          }
          else {
            iVar2 = param_1[0xd6];
            iVar5 = FUN_004c8700();
            uVar6 = (uint)*(ushort *)(iVar5 + iVar2 * 0x46 + 0x20 + param_1[0xd5] * 2);
          }
          FUN_004f93c0(uVar6,param_1[0xd6]);
          FUN_005088e0(*puVar1,puVar1[1],puVar1[1],0,1);
          *param_2 = 1;
        }
        iVar4 = iVar4 + 1;
        local_38 = local_38 + 1;
      } while (iVar4 < param_1[0xd4]);
    }
    if (DAT_00c9e2f8 == 0) {
      param_1[0xd5] = -1;
    }
  }
  return;
}


