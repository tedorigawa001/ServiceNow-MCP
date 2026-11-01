# CT-B TB-A：純粋な上位時刻scope・一度限り移譲の合成検証

Date: 2026-11-01 / 基準HEAD: `4d2546f`。
Status: **非実行値scopeのみ。CT-A accepted／実session／実source／worker jobには未接続。**

[詳細設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)§9と[接続契約draft-0.4](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Permit発行・Pushは行わない。

## 1 実装範囲

[release-time-owner](../src/servicenow/review-kernel/release-time-owner.ts)は任意のfake bindingから作れる純粋値部品で、sessionやsourceを認証する部品ではない。scope内のallocate claimと固定順序だけを保証する。実runごとの唯一のscope生成・CT-A accepted由来のO・close前移譲・正常資源解放とrun失効の区別はTB-Bに残す。runtime登録／台帳・既存class・worker protocol・公開JSONは変更しない。

同binding referenceと固定8field（run／session／source／key／origin／budget／S／全L）をdescriptorでpinして照合する。getterを実行せず拒否し、descriptor取得の例外を固定理由へ写像する。Proxy trapの実行自体を防止する保証はない。UTCはISOミリ秒形式と固定S／L範囲を検査するだけで、新しく採取しない。

allocate→observe→issue→accept→discard。状態claimはguardより先、issueはdonor値をpendingへ取り外し、acceptはhandle／pendingをpre-guardより前に消費する。成功時だけupperにS／L／O／U=Oを保持する。失敗・discardは各値／handle／binding参照を消し、先行固定code／phaseだけを残す。同期revokeと捕捉された再入でも復活しない。

inspectは凍結非実行dataだけで、consumerの証拠に戻せない。callerが保持したcopyやcheck依存のclosureを消去したこと、heapの物理消去、時刻保持による新dispatch権限は主張しない。成功時の元L固定と、UTC上端等号を認めても元guard期限切れなら停止する点を分ける。

## 2 合成試験と保証の区別

[新規試験](../tests/review/release-time-owner.test.ts)71件。正常移譲・等号、scope内の重複生成／順序／再利用拒否、別binding／field変更／copy・foreign handle、8guard境界の停止・再入、discard 2guardの停止、全10guard境界の同期revoke、UTC逆行／超過／不正日付、L不正／残時間置換、getter拒否・固定例外／診断・秘密非出力を確認する。

非空／空200由来の証拠やlegacy判断・HTTP／cleanup診断ownerとの接続は今回の試験にはない。外部診断を変更しない純粋性と固定first-stopを試しても、実classの診断合流まで保証したとはしない。TB-01〜05／08の値／状態側の一部を確認する段階で、TB-06／07・worker時刻／T_i／Eは未実施。旧試験は削除・skip・期待緩和しない。

[compiled値fixture](../tests/review/fixtures/compiled-release-time-owner.mjs)はdistの同値部品だけで移譲・discard・再利用拒否・取消理由を確認する。B-03の専用開発assembly compiled保証とは別で、配布fixtureから本物のsessionや台帳を操作しない。

## 3 初回失敗・修正履歴

| 段階 | 観測と修正 |
|---|---|
| 最初の動作RED | stubがfreshのままで、正常移譲1件が失敗。状態／時刻移動を追加しGREEN。module不在のimport失敗をREDとして数えていない |
| one-shot／binding／handle | 重複allocate、別binding、copy handleをそれぞれ1件ずつ追加してRED。固定順序・同reference検査・opaque handleの先行消費を順に追加しGREEN |
| guard | 全8境界の停止試験が8件失敗／4件成功。pre/post guard・first-stop診断・再入後state検査を追加しGREEN |
| UTC／discard／revoke | UTC不正／範囲外4件が失敗、discardとrevokeも各追加時に失敗。値検査・終端破棄・同期失効を各段階で追加しGREEN |
| getter置換 | 56件中1件が固定内部理由ではなくPRIVATE_GETTERで失敗。descriptor値だけのsnapshot／照合へ変更し、getter実行0でGREEN |
| 初回build | TS2322、issueの戻り値がobjectまたはundefinedと判定された。単体tscでも再現。any由来の凍結値を可変slotへ代入して返していたため、生成したobject型のlocal handleをslotへ格納して同localを返す最小修正。再build成功 |
| 補助静的検査 | 未接続確認の初回スクリプトは、定義file自身がfile名文字列を含むと誤仮定し、検索0件のexit 1を例外にした。factory定義名の検索へ訂正し、src内は定義1件だけと確認。製品コードの修正ではない |

失敗はstubからの段階的追加と型検査の記録であり、従来製品でこれらの不具合が発生していたという主張ではない。試験の期限・製品上限は緩めない。

## 4 検証結果

| 検証 | 結果 |
|---|---|
| 関連回帰 | 新規71件＋既存149件、8ファイル／220件成功 |
| build | 初回TS2322を修正後、`npm run build`成功 |
| standalone TypeScript | 新規試験のstrict型検査、エラー0 |
| オフライン梱包 | `node tests/review/package-http-classification.mjs`成功、437ファイル。4成果物追加、依存zod限定・root import／時計／I/O／timer禁止AST、既存compiled fixtureと新値fixtureを確認 |
| 全体合成テスト | maxWorkers=1、233ファイル／10,138件成功、失敗0・pending 0、新規71件を含む。JSON内の開始〜最終試験終了は約266.9秒 |
| 文書・差分 | 更新8文書のローカル参照117件・版数参照24件が整合。`git diff --check`成功 |
| 未接続確認 | src内のcreateReleaseTimeScopeは新moduleの定義だけ。既存session／source・workerからの呼出しなし |

全体実行は`npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-tba-tests-20261101.json`。別build／testと重ねず単独実行し、製品・試験の期限を変更していない。結果JSONは一時成果物で、本書に恒久結果を記録する。通常並列の再発解消・B-03の専用compiled保証は主張しない。補助package-workerの依存取得試験は実行していない。

コミット前確認：候補13ファイルを含むindex全体を一時コピーへ展開し、既存node_modulesだけを参照してbuild・関連8ファイル220件・新規試験のstandalone TypeScript・437ファイルのオフライン梱包を再確認し、すべて成功した。候補13ファイルのbytes一致と、無関係な`.vscode/`・`CLAUDE.md`がコピーに含まれないことも確認した。全体10,138件はこのコミット前確認では再実行せず、上表の実装時結果と区別する。確認後の追加変更は本段落だけで、実装・試験は変更していない。

## 5 残課題

次はTB-B。実run側の唯一の生成claim、CT-A accepted値のprivate移譲元、正常source資源解放と取消／異常closeの識別、失効hookと診断ownerへの接続をfake I/Oで検証する。現finallyを弱めてOを残さない。

worker世代／job claim・T_i／E、CT-C、B-03、低減LとJSON宣言deadline、日時長cap・全体work上界は未完了。固定8fieldと少数slotが有限でも全体受付の根拠にしない。本番cap投入・正式発行・実source差替え・friend撤去を行わない。
