
void __fastcall FUN_004ac670(int param_1)

{
  int iVar1;
  int *piVar2;
  
  iVar1 = FUN_00612510(3);
  *(undefined2 *)(iVar1 + 6) = 0x20;
  piVar2 = (int *)FUN_006100d0();
  (**(code **)(*piVar2 + 0x20))(*(undefined4 *)(param_1 + 0xac));
  FUN_00610120();
  FUN_006123d0(iVar1);
  FUN_00612520(iVar1);
  return;
}

