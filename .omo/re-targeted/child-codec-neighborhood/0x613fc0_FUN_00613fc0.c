
undefined4 * __fastcall FUN_00613fc0(undefined4 *param_1)

{
  undefined4 uVar1;
  int iVar2;
  void *local_c;
  undefined1 *puStack_8;
  undefined4 local_4;
  
  local_4 = 0xffffffff;
  puStack_8 = &LAB_0066a408;
  local_c = ExceptionList;
  ExceptionList = &local_c;
  FUN_006147a0();
  iVar2 = 0;
  local_4 = 0;
  param_1[3] = 0;
  param_1[4] = 0;
  *param_1 = &PTR_FUN_00681fc8;
  uVar1 = FUN_00648d42(0x48);
  param_1[3] = uVar1;
  uVar1 = FUN_00648d42(0x10);
  param_1[4] = uVar1;
  do {
    uVar1 = FUN_00648d42(0x400);
    iVar2 = iVar2 + 4;
    *(undefined4 *)(param_1[4] + -4 + iVar2) = uVar1;
  } while (iVar2 < 0x10);
  ExceptionList = local_c;
  return param_1;
}

