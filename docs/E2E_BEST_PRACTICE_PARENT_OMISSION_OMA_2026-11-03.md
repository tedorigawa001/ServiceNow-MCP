# OM-A strict値型・親prefix純粋計算 検証記録

Date: 2026-11-03 / 基準HEAD: `bb47b63`。

## 1 範囲

[CG-C設計§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OMISSION_CGC_DESIGN.md)の開発専用pure helperと合成試験を追加した。runtimeソースと既存root／issuerは変更していない。今回の出力はauthority:noneのimmutable DATAであり、capture／ParentOmissionDecision・元receipt／job・同planへの移譲や失効証拠を発行しない。

strictなmodel_id／版／cap=100、同selected順のproducer付き全row、prefix limitations／errorsを検査し、保持finding数を行データから導出する。過剰なreviewedだけを全結果単位で省略し、後続の収まる行はkeepする。元worker omittedは別producerの事実として保持し、親finding省略と警告追加条件を混同しない。元値はoriginal_rowsへ残し、変換後assetsと別に保持する。

純粋値の全体run contextは未検証。空データの計算成功をreviewedゼロの回復証拠と呼ばず、0.3の選択契約やretainedのstop warning、status／coverage／counts／E等の上位検査も省略しない。新helperのscope／brand／入口はnpm配布物に含めない。

## 2 RED／GREENと切り分け

1. 未存在helperのimportをREDで確認し、1 reviewedを不変のまま保持する最小経路をGREENにした。
2. 99＋2の後に1が来る固定表を追加してRED（101／102をkeepしていた）を確認し、全結果省略・保持数を増やさない分岐と警告／errorを追加してGREENにした。
3. 元worker omitted／metadata／retrieval／retainedを挟む対照をRED（reviewed以外unsupported）で確認してから、NR-Aのstrict producer別variantへ接続しGREENにした。
4. 拡張39件の初回はinvalid_nestedだけが失敗した。asset構造とnested resultの各schemaは通るが、外側IDと内側target IDの関係は集約側の検査であるため、新helperには欠けていた。既存aggregate schemaと照合し、ID一致・applicable／nested requested rule集合一致を追加した。入力の制限やテストの期待値は緩めていない。

型検査・lintの初回失敗はなし。既存期限・テスト期限の延長、runtime修正、実通信は行っていない。

## 3 最終検証

| 検証 | 結果 |
| --- | --- |
| OM-A新規 | 71件成功 |
| OM-A／NR-C／NR-A／NR-B／CG-BP1／CG-A関連 | 6ファイル・437件成功 |
| 全体回帰 | 265ファイル・12,940件成功、失敗0・pending 0 |
| build | 成功 |
| 新helper／試験のstrict TypeScript検査 | 成功 |
| 変更TS・梱包試験のESLint | 問題なし |
| 梱包 | 441ファイル。新helper／constructor相当入口／scope／brand非同梱、固定import監査・seeded runtime／I/O／clock／worker漏出の負の対照成功 |

全体回帰はmaxWorkers=3、既存localhost合成待受を許可した条件で実施した。実PDI・外部サービスは使っていない。新helper自身は時計・timer・worker・transport・実sessionを起動しない。

### 3.1 独立oracle・境界・負の対照

- F＋n=99／100／101、ゼロfindings、100を保持した後の0／1、超過後に収まる行、繰返し超過を明示表で照合した。モデルの返却値から期待表を生成していない。
- response_truncatedの有無・finding_budget_exceededだけ既存・元omitted先行・errors=0／99／100・同code error既存を独立表で検査した。error_details_truncatedの既存有無、prefix順と重複を保つ。親段階での103 limitationsもそのまま保持し、finalizeのdedupを前倒ししない。
- metadata rejected／retrieval rejected／analysis rejected／retainedの正常値と、producer違い／schema-only unauthorized／親omission入力／不正reasonを対照にした。0.2 deletedはpure値として受け、0.3 deletedと0.2のcandidate_filter_violationは拒否した。
- 正規化assetの論理JSONをnative UTF-8計測でB−1／B／B＋1へ固定し、前2つ受理・超過拒否を確認した。超過を任意omittedへ変換しない。これはpure値のサイズであり元wire originの証明ではない。
- 100行／101行、missing／順序差／重複／ID差、cap／model差、余分field、101 findings、nested ID／applicable rule矛盾、長いstring・deep／cycle、特殊prototype／symbol／undefined／function／疎配列を拒否した。getter／Proxy／toJSON callbackは呼出し0回。
- caller後書換えとfreeze副作用なし、出力のdeep freeze／readonly compile-fail、固定例外にraw値・causeがないことを確認した。原値と変換後DATAには合成本文が含まれるが、診断・エラーメッセージへ出さず、実受領物の保護ownerとも呼ばない。
- adapterを実行せず、親finding／元omittedの分岐、prefix reduce、addErrorのASTを固定照合した。`>`→`>=`、warning順、reason、prefix式、error capの変更で監査が失敗するseeded対照を通した。これはsource drift検出であり、その監査自身を独立のfinding期待表の代用にはしていない。

## 4 レビュー修正（2026-11-03）

§3の71件・12,940件は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包、全体合成265ファイル／12,940件成功・失敗0を再確認した。

- 実装：retained（not_processed）行の後に処理済み行が続く順序を受理していた。adapterはsoft deadline・request budget・停止理由のいずれでも、ループ中断後に残り全行をnot_processedとして連続した末尾へ追加し、停止warning／errorもループ後に加える。開始prefixに省略副作用だけを足す本モデルはこの順序でのみ成立するため、retainedの後に別producerが来れば`order`で拒否するよう修正し、[CG-C設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OMISSION_CGC_DESIGN.md)をdraft-0.4へ改版した。既存の「元worker omittedを区別」試験はretained（row 5）の後にreviewed（row 6）を置いていたため、retainedを末尾へ移した正しい順序へ直した（期待traceも同順に更新）。末尾連続を受理し、3種の非末尾順序を拒否する1件を追加した。
- 試験：applicableの重複判定（2 rule同長の重複）と長さ判定（部分集合）、nestedのreviewResultV2Schema refinement（出典URL変更）、selectedの昇順判定（selectedとrowsを一貫して逆順）、kind不一致は、外しても既存試験が通過した。2 ruleのnested結果で完全一致を受理し重複／部分集合を拒否する1件、nested refinement 1件、逆順とkind 1件を追加した。

上記7変異はそれぞれ追加・修正した試験だけを失敗させた。中間limitations上限103（構造上それ以上増えない）、prefix／asset copy上限（schemaの上限が先に効く）は等価変異として扱う。新規試験は75件。修正後も全体合成265ファイル／12,944件成功・失敗0。

## 5 費目・未対応

prefix copyは深さ3／node2500／文字費650000、各assetはCG-A由来の現analyze depth・array100／key30／node262144／文字費786432、正規化JSON≤B。row／trace／原値と変換後の索引は100以下。親で増えるwarningは最大3なので中間枠103。これらは有限の局所構造であり、native key列挙・schema copy／refinement・serialize／UTF-8走査・NR-A再投影・freezeの総work／heapを証明しない。

usageはcopyのnode／文字費と行数だけ。Bはserialize後の拒否条件であり、拒否されるassetの一時文字列をB以下に抑える確保前保証ではない。共有budget／停止owner・取消・全体deadlineのcheckpointは未接続で、60秒の強制中断をpure関数だけで保証しない。C/G/P・210試行・元全deadline・本番受信枠は変更していない。全体受付と本番capは投入しない。

OM-Bのbounded count-only size／固定Eのfinalizeモデル、OM-Cの保護prefix／capture供給と親決定証拠・one-shot／同期失効／discard、OM-Dの同accepted／plan・finish jobへの接続とfull内容gateが残る。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持した。実接続・実通信・実機操作・設定変更・Permit／候補発行・Push・本作業のコミットは行っていない。
