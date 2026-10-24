# MA-02 V07 観測単位・必須coverage表

- Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `304dd27`
- Status: 現行要件の具体化。監視実装・coverage認証・人の承認は未実施
- 親: [V07/V08公式監視機構調査](BEST_PRACTICE_BP5_R2_OL03_MA02_V07_V08_OFFICIAL_MONITORING_RESEARCH.md)、[V01〜V11条件](BEST_PRACTICE_BP5_R2_OL03_MA02_NO_TRUST_SAME_HOST_VM_OPTIONS.md)

## 1. 固定する意味と対象

V07はfileアクセス/書込/exec、通信/名前解決/IPCの**各試行と拒否**を要求する。OSの許可判断点に到達した操作だけに狭めない。親調査§6.1の現行要件維持を受け、縮小案の採用・比較には進まない。本書は本計画の証拠契約案であり、各APIのOS挙動を新たに検証した記録ではない。公式機構の根拠・制約は親調査§2のE1〜E8/N1〜N4/A1/F1を参照する。

監視対象は固定guestの検証器processと子孫、およびそれらが委譲したfile/通信/名前解決/IPC操作。初期load/初期化から終了までを含み、main関数の前後を無監視区間にしない。起動する監督・監視器自身の正当な管理操作は別主体/別policyとして識別し、検証器の要求を管理操作に混ぜて除外しない。brokerによる代理操作の帰属が不明ならcoverage未確認である。

「各」は、固定binary・依存closure・OS/ABIで対象機能を実現する公開APIとsyscallの各呼出しを指す。下表のAPI名は代表例で、閉じた許可リストでも網羅的なmacOS syscall一覧でもない。別名・variant・直接syscall・library内部経路を含む完全な入口inventoryは未作成。表にないvariantを対象外にせず、未分類の対象操作は停止理由とする。試験で未使用だった入口を自動除外しない。

通常のCPU命令/メモリloadを1件ずつ新たに監査する要件は追加しない。ただしmmap等のfileへのアクセス経路、その権限/寿命、既存mappingを経由する抜け道は説明が必要で、mapping内のアクセスをopen件数から推定しない。実現不能な範囲を黙って除くのではなく未対応として残す。

## 2. 証拠の層と1件の数え方

| 層 | 観測単位 | 必要な区別 |
|---|---|---|
| A: API試行 | 対象APIへの実際の1回の進入 | fixtureの「呼ぶ予定」ではなく進入。library内で拒否/完結しsyscallを出さない場合も1試行。cache hitの名前解決も対象 |
| S: syscall試行 | 対象syscallへの実際の1回の進入 | 戻り値/errno/中断・未復帰を別記録。EINTR後の再試行は別件。API内部の自動retryも潰さない |
| G: OS判断点 | AUTH/flow等でOSが渡した1判断 | 受信したevent種別・対象・判断・応答受理・期限を記録。A/Sとの1対1対応を前提にしない |
| R: 結果 | A/Sの完了、または未完了での終了 | 成功/失敗、短read/write、拒否、その他失敗を分離。Gでdenyを返したことだけでRを推定しない |
| C: 完全性 | 開始/終了境界と監査channel全体 | 有効化・購読/mute/cache状態、drop/queue上限、保存・末尾、主体帰属。heartbeatのみでは不足 |

1つのAPIが0個/複数のsyscallを呼び、1つのsyscallに複数判断点があってよい。API試行数・syscall試行数・判断点数は別counterとし、合計して1つの「試行数」にしない。対応関係はone-to-many/zeroを表現し、時刻やPIDだけの近接推定で確定しない。

必要な非秘密の結合項目案は、run/構成tuple、主体の世代付きidentity、thread/操作ID、層/固定operation ID、資源の論理IDと世代、親操作ID、進入/完了順序、判断/応答受理、有限な結果分類。raw path/argv/env/宛先/内容は公開summaryへ出さない。FD番号だけを資源identityにしない。具体的な安全な収集方法・記録スキーマ・値域上限は未実装/未承認。

APIとsyscallの対応なしは、理由を裏付けられる場合だけ「API内完結」等と記録する。OS判断点を経由しなかった場合もA/Sの試行を残す。終了・取消により戻らなかった呼出しは`interrupted`/`outcome_unknown`として保持し、失敗・拒否・試行なしに変換しない。試験process自身の任意logは補助証拠であり、単独で通常GnuPGの完全性を証明しない。信頼できるA/S収集機構は未確定である。

## 3. 必須coverage表

全行についてA/Sの該当経路、RとCが必要。Gは存在する判断点を追加照合する層であり、Gだけの実装は不足。対応するOS判断点がないことを示せてもA/Sの要求は消えない。「部分候補」は親調査の機構に限定した文書評価で、実coverageは**全20行未検証**である。

| ID | 対象API/syscall群の代表例と必須観測 | G層の部分候補 / 残る不足 | 必須境界・負の対照への対応 |
|---|---|---|---|
| CV01 | open/openat/fopen等の取得。libraryと実syscallを分離 | ES AUTH_OPEN/CREATE等の判断点候補。全早期失敗の到達は未確認 | 存在/不存在、読取/書込flag、DAC/TCC/sandboxでの拒否、相対path/alias。NC01/02 |
| CV02 | read/pread/readv等、buffered file APIの各試行 | open判断点はreadの代用不可。既存FDでの各read監視は未確定 | 既存/継承/複製FD、0 byte/短read/EOF/EINTR、API buffer内完結。NC01/02 |
| CV03 | write/pwrite/writev等とbuffered書込API | ES NOTIFY_WRITEは各失敗writeの完全監査ではない | 既存writable FD、短write、容量不足/拒否、flush、retry。NC01/02 |
| CV04 | mmap/mprotect/msync/munmap等のfile-backed経路と権限/寿命 | ESの関連AUTH等は候補、mapping後の全アクセスを示すものではない | read/write mapping、既存/継承mapping、権限変更、失敗/未完了。NC02 |
| CV05 | stat/access/getattr/xattr系等の照会、directory列挙/readlink等 | ESの関連eventは対象種別ごとに照合が必要 | 無変更の参照/拒否、名前探索、symlink、directory反復、library内完結。NC01/02 |
| CV06 | create/mkdir/link/rename/unlink/truncate/chmod/setattr等の変更 | ES関連AUTHの部分候補。全variant/失敗順序は未確認 | 既存/不存在、metadata変更、途中失敗、同一論理対象の別名。NC01/02 |
| CV07 | dup/dup2/fcntl等、close、FD受渡し/継承と資源世代 | 一部の関連eventだけで完全なFD台帳としない | 番号再利用、close後、継承/受信済み資源、別対象の混入。NC02/04 |
| CV08 | fork/posix_spawn/exec系APIとprocess生成・image切替 | AUTH_EXECとfork/exec通知は部分候補。spawn/exec/forkは別 | 拒否exec、forkのみ、早期spawn失敗、retry、loader/初期化。NC03 |
| CV09 | helper/agent起動要求とbroker/launchd/XPCへの委譲 | EXECだけでは依頼元の要求を証明しない | 子孫以外に起動された代理processと応答、要求のみの失敗。NC03/04 |
| CV10 | UNIX socketのsocket/connect/bind/listen/accept/send/recv等 | AUTH_UIPC_CONNECT/BIND等は部分候補。全send/recvではない | agent不存在/拒否、既存接続、継承FD、socketpair、再接続。NC04 |
| CV11 | pipe/socketpair、read/write、共有memory等のIPC経路 | UIPC connectの判断点だけでは不足 | 既存channel、名前あり/なし、FD転送、失敗/権限変更。NC04 |
| CV12 | Mach/XPCのlookup/connect/send/reply等の要求 | 必要な全API/syscall試行の公式観測経路は未確定 | bootstrap lookup、拒否/不存在service、既存port/connection、broker代理。NC04 |
| CV13 | IP socket/connect/send/sendto等のTCP/UDP通信要求 | NE flowは部分候補。全syscall試行の代用ではない | IPv4/IPv6、外向き/host/loopback、routeなし/接続拒否、nonblocking。NC05 |
| CV14 | bind/listen/accept/recv、既存/継承IP socketの利用 | 新規flowだけでは既存channel/各操作の証拠にならない | inbound、未接続UDP、既存接続、短送受信、取消/非同期完了。NC05 |
| CV15 | getaddrinfo等の名前解決APIの各要求 | DNS proxyのport 53 flowは要求APIの代用不可 | cache/hostsで完結、cache miss、resolver IPC、エラー/取消。NC06 |
| CV16 | DNSの実送受信、直接port 53、resolver代理通信 | DNS proxy/NEの部分候補。要求元との因果結合は未確定 | UDP/TCP、直接IP、暗号化DNS等の別transportを除外しない。NC05/06 |
| CV17 | library内・OS早期拒否・cache/muteでGに出ない対象操作 | AUTH/flowの無通知をA/Sのゼロに変換しない | 不正引数/権限/不存在/通信不可、反復cache hit、対象別の通知順序。NC02/05/06/07 |
| CV18 | signal/task制御等を使う監視器/監査先への干渉要求 | ESの一部AUTH等は候補。全干渉経路の保証ではない | 停止/終了/権限変更・log改変/削除、設定/監視IPCへの操作。NC07 |
| CV19 | 全層の購読/保存/主体・時系列結合と欠落検出 | ES連番は部分候補。未購読/mute/cache/末尾欠落は別 | queue/log上限、連番gap、監視器再起動、保存失敗、出力超過。NC07/08 |
| CV20 | 起動前readyからload/本体/終了/子孫終了・drainまでの境界 | 終了通知/heartbeatのみで全寿命を証明しない | 開始前/終了直後の試行、取消/期限超過・AUTH暗黙ALLOW、末尾切断。NC03/08 |

CV17〜CV20は横断条件で、CV01〜CV16の件数に加算する別の業務試行ではない。各行はread/write、IPv4/IPv6等をまとめた分類であり、負の対照の合格は下位variant単位で記録する。親のNC01〜NC08は未実施のケース群で、NC01が1件通っただけでCV01〜CV06全部を合格にしない。

## 4. 未観測・未対応・拒否の扱い

文書段階の能力評価と、将来の実行票の状態を分離する。以下は実装済みenumではなく意味契約案である。

| 状態 | 意味 | 必須の扱い |
|---|---|---|
| `coverage_unknown` | 機構/入口inventory/根拠が不足し能力を判断不能 | 準備gateで停止。機能なしとは断定しないが、監視可能とも認証しない |
| `unsupported` | 固定構成で必要な層/variantを扱えないと確認 | 準備gateで停止。必須表から除外せず制約を保持 |
| `not_exercised` | 能力を試す対照が未実施/未到達 | V08未成立。通常logが静かでも合格にしない |
| `unobserved_attempt` | 対照等で試行があったが必要な層/結合を得られない | 実行票を不成立にし、先行診断と未観測箇所を保持。ゼロ件禁止 |
| `incomplete` | drop/上限/保存失敗/取消/終了未確認等で監査区間が不完全 | 安全な停止/cleanupへ移り、結果は保証不足。最後まで見えた部分だけで成功票を作らない |
| `observed_denied` | 試行と判断/拒否結果を必要な層で照合できた | 対照の期待結果として扱えるが、通常GnuPGの禁止試行なら不成立。単なるEACCESはpolicy拒否と未確定 |
| `observed_forbidden_effect` | 禁止操作が成功/副作用を起こした証拠 | 即不成立。後で拒否/cleanupできても消さない |
| `no_forbidden_attempts_observed` | 完全性が確認された有限な対象区間で禁止試行を観測せず | 必須coverage/全対照が成立して初めて限定的に記載可。全環境・全将来入力の無試行保証にはしない |

件数は未観測/未対応/未実施で`0`を使わず、未確定のままreasonと対象層を示す。既存JSON契約へ勝手に新しい状態を追加する実装は行わない。`not_applicable`は必須行の失敗回避に使わない。固定環境で経路が無効/到達不能だという主張も、そこへ要求した試行の監視義務を取り除かない。

対応するGが存在しない場合、そのG件数は「OS判断点なし」の根拠付き分類であり、A/Sの欠測とは区別する。ENOENT/EINVAL等の失敗ではpolicy deny応答が存在するとは限らない。全ケースにdeny API受理を要求するのではなく、拒否主体・段階と戻り結果を示す。判断点に到達した場合のdeny受理と、判断点前に拒否された場合のA/S/R観測の両方が必要である。

## 5. 有限な試験と完全性の受付条件

1. 固定OS/ABI・binary/依存closure・主体集合・操作variant inventory・時間区間を確定する。inventory自体が未確定なら後続の静かなlogを完全性の証明にしない。
2. 各variantについてA/S/G/R/Cの供給元と信頼境界、禁止policy、結果の期待値を登録する。sampleへの挿入logやAPI wrapperだけで、未改変GnuPG・直接syscallも監査できるとはしない。
3. NC群を下位variantへ展開し、存在する禁止対象で判断点拒否を確認する対照と、その手前で失敗する対照を別にする。許可操作の対照で収集器の無稼働と区別するが、通信遮断を解除して実外部宛先へ接続しない。
4. 反復・retry・多thread・既存資源・broker、初期load/終了境界、飽和/切断/期限逸脱を有限な件数・bytes・deadline内で確認する。値域/資源上限は未承認で推定しない。超過時は停止し、sampling/黙った省略で収集量を削らない。
5. 全必須variantの能力と負の対照が成立し、同じ構成の通常試験で禁止試行なし・監査完全・終了/cleanup確認済みの場合に限り、限定した監査結果を検討する。1行でもUnknown/未対応/未実施ならV07/V08合格なし。試験実績だけで未知の入口の不存在を証明しない。

完全なA/S監視の成立性、APIとsyscallの相関、broker帰属、mapping/既存資源、末尾完全性は現時点で未解決。ES/NEの部分coverageや既存VMの機能だけで埋めない。現行要件を満たせない場合は実施不可を維持し、別契約への縮小には利用者の明示指示と承認が必要である。

## 6. 次段階と不変条件

次の文書調査は、CV02/CV12/CV15/CV17等の不足に対する公式機構のcoverage根拠と、固定環境の入口inventory作成方法を確認すること。実機での観測やfault source実行は今回の許可範囲外。必要な信頼元・監視器・構成・対照が不足しているので、D4を開始しない。

本書は人による監視構成の承認、V07/V08の確認済み化、実layout/必要量の証拠にはならない。未導出5項目Unknown、全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。[チェックリスト](BEST_PRACTICE_BP5_R2_OL03_MA02_USER_INFORMATION_APPROVAL_CHECKLIST.md)はI01〜I05回答済み、E/A/T20項目未チェックのまま。

実装・導入・起動・環境/設定操作・鍵承認・担当者連絡・本番cap投入・完成parts/permit発行・通常strict差替えは行わない。ケースや監視器の追加実行を文書作成から自動承認しない。
