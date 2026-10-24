# MA-02 同一端末VM候補の公式仕様比較

- 状態: draft-0.1 / 文書調査のみ / 人による構成承認なし
- 調査日: 2026-10-24
- 比較基準: commit `53fe817` と [V01〜V11・進行gate](BEST_PRACTICE_BP5_R2_OL03_MA02_NO_TRUST_SAME_HOST_VM_OPTIONS.md)
- 対象: UTM（Apple backend）、Parallels Desktop（macOS ARM guest）、Tart（macOS guest）。候補集合であり採用順位ではない。

## 1. 結論と調査境界

3候補にはmacOS guestを扱う公式資料がある。一方、今回確認したVM管理仕様だけでは、V07の禁止操作の**試行**の監査、V08の負の対照、V09の試験processの終了・残留FD確認は成立しない。機能未搭載との断定ではなく、その能力を示す証拠を今回得ていないという意味である。VMの停止機能はguest内cleanupの証明ではない。

host OS/CPU・導入済みsoftware・権限は調査していない。Apple Silicon/macOS guestを文書上の候補構成とするが、利用端末で動くことは未確認。Linux guestの予備試験をmacOS arm64の実証へ置き換えない。製品版、guest build/image digest、契約edition、監視器、制限値は未決定である。

公式資料は機能の仕様根拠であり、配布binary/image/依存closureの真正性証拠ではない。VM隔離・GnuPG検証器の信頼元・Rust公開鍵fingerprintの独立確認は別の条件である。I01/I04の「なし」をVM導入で解消した扱いにしない。

## 2. 根拠資料と該当箇所

以下は調査日にAIが公式本文を確認した記録。文書は更新され得るため、将来の承認時には固定製品版に対応する資料を再照合する。Parallelsのv20資料を最新版の全editionへ一般化しない。UTM資料のmacOS 27条件を利用端末の対応済み条件と見なさない。

| ID | 公式URL・該当箇所 | 今回読み取った範囲・限界 |
|---|---|---|
| U1 | [UTM: macOS](https://docs.getutm.app/guest-support/macos/) — Requirements / Shared Directory / Clipboard / Missing Features | Apple Silicon・macOS 12以降のhostでApple backendを使用。directory共有はhost/guest 13以降、clipboardは15以降など条件がある。共有が利用可能であることと全経路を無効にできたことは別 |
| U2 | [UTM: Network（Apple）](https://docs.getutm.app/settings-apple/devices/network/) — Network Mode | Sharedはhost到達性がある。26以降のNAT/Host Onlyにも通信相手が残る。今回のページでは完全非接続の保証を確認していない |
| U3 | [UTM: Snapshots](https://docs.getutm.app/advanced/snapshots/) — Requirements | Apple backendはmacOS 27以降、操作時は停止またはsuspendが必要。外部/read-only/removable driveはsnapshot対象外。QEMUの条件と混ぜない |
| U4 | [UTM: Scripting Reference](https://docs.getutm.app/scripting/reference/) — stop / stop method | request、force、backendを終了するkillを区別。対象backend/固定版での動作・終了確認は未検証 |
| P1 | [Parallels: Create a Virtual Machine](https://docs.parallels.com/landing/parallels-desktop-developers-guide/command-line-interface-utility/manage-virtual-machines-from-cli/general-virtual-machine-management/create-a-virtual-machine) — Creating a macOS Virtual Machine | Apple SiliconではApple Virtualizationを使用し、同じmacOS majorのhost/guest構成のみ動作保証と記載。固定IPSWを指定する経路がある |
| P2 | [Parallels v20: Network Preferences](https://docs.parallels.com/landing/pdfm-ug/v20-en-us/parallels-desktop-for-mac-20-users-guide/parallels-desktop-preferences-and-virtual-machine-settings/parallels-desktop-preferences/network-preferences) — Shared / Host-Only / Note | Shared・host-onlyは完全遮断ではない。macOS ARMのhost-onlyにはhost 15以降・製品20.4.0以降の条件。Network PreferencesタブはPro/Business/Enterpriseに限定と記載 |
| P3 | [Parallels v20: Saving Snapshots](https://docs.parallels.com/landing/pdfm-ug/v20-en-us/parallels-desktop-for-mac-20-users-guide/advanced-topics/working-with-virtual-machines/saving-snapshots-of-a-virtual-machine) — Notes / Creating / Reverting | Apple SiliconのmacOS VM snapshotにはmacOS 14以降の条件。SmartGuardはmacOS VM非対応。手動復元の存在から自動復旧・完全消去を推定しない |
| P4 | [Parallels v20: Tools for Mac](https://docs.parallels.com/landing/pdfm-ug/v20-en-us/parallels-desktop-for-mac-20-users-guide/advanced-topics/installing-and-updating-parallels-tools/parallels-tools-for-mac) — Installing / Updating | Toolsの自動installはしないがApple SiliconのmacOS VMにはinstall imageが常時mountと記載。導入済みToolsには自動更新経路がある。追加媒体/連携を審査対象に含める |
| T1 | [Tart: Quick Start](https://tart.run/quick-start/) — Requirements / Creating a VM / Shared directories / Running scripts | Apple Silicon・host macOS 13以降。IPSW、CPU/RAM設定、read-only共有folderを指定する経路がある。CI向け既成imageやSSH運用を今回の隔離構成として採用しない |
| T2 | [Tart: FAQ](https://tart.run/faq/) — Connecting to a service running on host / VM location on disk / Headless machines | default NATでhostへ到達可能。VM/cacheはhost上に保存される。keychainに関する回避策の記述は提供者の説明であり、OSの公式保証や本計画の許可ではない |

この比較ではinstaller/鍵/archiveを取得していない。価格・購入条件・全editionのCLI可否・署名/公証・固定版の配布hash・guest OS利用許諾は未確認。公式ページに導入/起動/鍵管理の例があっても実行していない。

## 3. V01〜V11の対応表

「条件付き」は関連する公式機能があること、「追加設計」はVM以外の境界が必要なことを表す。どちらも適合済みではない。「未確認」を機能なし/利用不可へ読み替えない。各行の最終状態は全候補で未確認である。

| 条件 | UTM / Apple backend | Parallels / macOS ARM | Tart / macOS | 適合を判断する前の不足 |
|---|---|---|---|---|
| V01 構成固定 | 条件付き: U1のhost/guest条件 | 条件付き: P1のmajor組合せ | 条件付き: T1のhost条件 | 実host tuple、固定製品版/CPU/guest build/IPSW digest。最新自動取得・可変tagを固定証拠にしない |
| V02 信頼境界 | 未確認: backendの選択だけでは不足 | 未確認: vendor製品であることだけでは不足 | 未確認: CLI公開だけでは不足 | host・hypervisor・monitor・配布closureの由来/更新/必要権限。VM escape等の残余リスク |
| V03 非共有 | 条件付き: directory/clipboard連携を列挙可能（U1） | 条件付き: Tools媒体/更新も検査対象（P4） | 条件付き: folder共有を指定する経路（T1） | 全共有・device・USB・agent/IPCの非接続を固定構成で確認。共有を指定しないことだけで全経路遮断としない |
| V04 通信遮断 | 未確認: U2のnetwork modeだけでは不足 | 未確認: P2のhost-onlyでもhost到達性が残る | 未確認: T2のdefault NATは不可 | adapter非接続/外側拒否の成立性、DNS/proxy/IPC/管理channel。Softnet等の別componentを自動追加しない |
| V05 入力持込み | 未確認: 許可されたread-only媒体構成が必要 | 未確認: P4の追加mountも管理対象 | 条件付き: read-only共有はあるがhost公開面を増やす（T1） | 認証済み検証器closureと合成fixture限定のstaging。read-onlyでもhost HOMEを公開しない。媒体作成/接続は別承認 |
| V06 実行制限 | 追加設計 | 追加設計 | 追加設計: VM CPU/RAM設定とは区別（T1） | guest非管理者・固定argv/env・scratch・process/FD/出力/child制限。VM資源上限だけで満たさない |
| V07 試行監視 | 追加設計 | 追加設計 | 追加設計 | file/exec/通信/DNS/IPCの拒否された試行、改変耐性、欠落検出。VM管理log・packetの無通信観測だけでは不可 |
| V08 負の対照 | 追加設計 | 追加設計 | 追加設計 | 既存20ケースの監督試験に結合。禁止アクセス/spawn/通信を検出できる合成sourceが必要 |
| V09 停止/終了 | 条件付き: U4のstop種別。process終了証拠は別 | 未確認: 固定版で停止/終了確認経路を要調査 | 未確認: 固定版で停止/終了確認経路を要調査 | 外側deadline/cancelとguest process tree/FD残留確認。pause/電源断をcleanup成功にしない |
| V10 復元/廃棄 | 条件付き: U3、OS条件と対象外driveあり | 条件付き: P3、macOS条件あり | 未確認: 固定版でbaseline複製/復元の意味を要調査 | 停止済みbaseline、aux/config/disk全体の復元範囲、hostコピー/backup/snapshotの所有者と保持。cloneをsnapshotと同一視しない |
| V11 限定結果取出し | 追加設計 | 追加設計 | 追加設計: 通常のSSH運用を流用しない（T1） | bounded summaryのみの検査/取出し経路。試験中の共有無効と両立する別phase。任意guest log/clipboardを公開しない |

## 4. 候補ごとの判断材料（採用判断ではない）

- UTM: Apple backend固有の共有・network・snapshot条件が文書化されている。一方、snapshotはmacOS 27条件があり、現在のhostへ適用できるか不明。QEMU向け機能をmacOS guestで使えると補完しない（U1〜U4）。
- Parallels: macOS VMの互換条件、snapshot、network設定のedition条件が比較的明示されている。一方、追加Tools媒体・自動更新と共有連携の棚卸しが必要。CLIで監督できる範囲・必要契約は固定版で未確認（P1〜P4）。
- Tart: macOS guestとCLI中心の構成が候補になるが、CI向け既成imageの利便設定は非管理者/固定入力の要件と別審査。通常のnetwork・共有folder・SSHによる結果回収を、そのままoffline試験へ持ち込まない（T1/T2）。

これは機能比較からの本計画上の推論であり、製品の安全認証ではない。いずれもV07/V08の監視設計とV09のprocess終了証拠が主要な残課題。既成guestの便利な初期設定や個人host keychainを、試験用trust rootやfixture入力に転用しない。

## 5. 次に文書上で決める順序

1. VM機能とは独立に、V07/V08の監視対象・拒否試行・改変耐性・負の対照を実現できる公式機構を調査する。成立しない場合は候補を選んでも試験開始不可。
2. 利用者が提示するhost OS/CPU情報を基に、比較対象の固定版・guest候補とV01/V03/V04/V09/V10の未確認事項を絞る。今回hostの照会・変更はしない。
3. 検証器の信頼元不足（D2）と、実鍵の独立確認不足（I04）を別々に扱う。VM仕様調査を信頼元承認へ昇格させない。
4. I05の非公開local保存方針について、VM disk/cache/snapshot/host backupまで含めた複製範囲・保存先・保持期間を決める。現時点で期間やACLを推定しない。
5. D0の方針選択とD3の操作別承認は利用者判断を待つ。取得・導入・環境作成・設定・起動・試験を一括承認にしない。

D1は比較資料を追加した段階で、固定構成/全条件の審査完了ではない。D2〜D5は進めない。[回答/承認チェックリスト](BEST_PRACTICE_BP5_R2_OL03_MA02_USER_INFORMATION_APPROVAL_CHECKLIST.md)のI01〜I05は回答済み、E/A/T計20項目は未チェックのまま。

## 6. 変更しない停止状態

未導出5項目はUnknown、全体受付は無効、telemetry調査は保留。APPROVED_REGISTRY=None、通常v2のUnavailable/gate92、DER/absence停止を維持する。本書は実layout・必要量projection・完成parts・permitの証拠を発行しない。本番cap投入、通常strict差替え、製品の採用/購入/導入/起動、環境操作、鍵承認、担当者連絡は行わない。

[GnuPG固定候補・合成隔離試験計画](BEST_PRACTICE_BP5_R2_OL03_MA02_GNUPG_BASELINE_ISOLATION_DESIGN.md)の20ケースは未実施のまま。公式資料の読み取りとMD更新は試験成功・人の承認・信頼判断ではない。

[V07/V08公式監視機構調査draft-0.1](BEST_PRACTICE_BP5_R2_OL03_MA02_V07_V08_OFFICIAL_MONITORING_RESEARCH.md)でES AUTH・NE flow/DNS制御、標準tool等の対応範囲と負の対照案を整理した。全拒否試行・file read・Mach/XPC・resolver cache等のcoverageは未確定で、VM候補のV07/V08は未適合/未検証のまま。実装・導入・権限/設定変更の承認にはしない。
