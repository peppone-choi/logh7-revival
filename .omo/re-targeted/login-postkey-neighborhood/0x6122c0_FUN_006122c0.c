
void __fastcall FUN_006122c0(int param_1)

{
  int iVar1;
  undefined4 *puVar2;
  int *piVar3;
  undefined **appuStack_1c [4];
  void *pvStack_c;
  undefined1 *puStack_8;
  undefined4 uStack_4;
  
  uStack_4 = 0xffffffff;
  puStack_8 = &LAB_0066a378;
  pvStack_c = ExceptionList;
  ExceptionList = &pvStack_c;
  FUN_00614a10(*(undefined4 *)(param_1 + 4));
  FUN_006103b0();
  appuStack_1c[0] = &PTR_FUN_00681f1c;
  uStack_4 = 0;
  puVar2 = (undefined4 *)FUN_006130a0(*(undefined4 *)(param_1 + 4),*(undefined4 *)(param_1 + 0x14));
  while (puVar2 != (undefined4 *)0x0) {
    FUN_006103e0(*puVar2,*(undefined2 *)(puVar2 + 2));
    iVar1 = puVar2[1];
    puVar2[1] = iVar1 + (uint)*(ushort *)(puVar2 + 2);
    piVar3 = (int *)FUN_00612510(CONCAT22((short)(iVar1 + (uint)*(ushort *)(puVar2 + 2) >> 0x10),
                                          *(undefined2 *)(param_1 + 8)));
    if (piVar3 == (int *)0x0) {
      FUN_00614bb0(*(undefined4 *)(param_1 + 4));
      FUN_00612290();
    }
    else {
      (**(code **)(*piVar3 + 8))(appuStack_1c);
      FUN_00614bb0(*(undefined4 *)(param_1 + 4));
      (**(code **)**(undefined4 **)(param_1 + 0xc))(piVar3);
      FUN_00612520(piVar3);
    }
    puVar2 = (undefined4 *)
             FUN_006130a0(*(undefined4 *)(param_1 + 4),*(undefined4 *)(param_1 + 0x14));
  }
  uStack_4 = 0xffffffff;
  appuStack_1c[0] = &PTR_FUN_00681f1c;
  FUN_006103d0();
  ExceptionList = pvStack_c;
  return;
}

