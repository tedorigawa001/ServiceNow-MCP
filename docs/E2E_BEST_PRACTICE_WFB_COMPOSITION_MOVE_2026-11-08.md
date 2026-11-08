# WF-B：B kernel／C-startの配置移行・互換入口の合成検証

Date: 2026-11-08 / 移行基準HEAD: `3a6b401` / [配置・private供給差分設計draft-0.3](BEST_PRACTICE_WFB_CANONICAL_SUPPLY_VIEW_DESIGN.md)。

## 変更範囲

設計§9手順1の物理配置だけを実装した。`tests/review/fixtures/snapshot-read-composition-fake.ts`にB kernel／SourceOpsとC-startの既存本体を置いた。供給表／正規source registry／非実行view／下位移譲claim・新factoryは追加していない。

- B本体は先頭コメント・importの配置を除き移行前と同一。
- C-startは同条件に加え、module-localのAssembly→CStartAssembly、Scenario→CStartScenario、scenarios→cStartScenariosという衝突回避の3識別子だけを変更。
- shared-read-hash-kernel-fake.tsはcreateReadHashFakeだけをre-exportする2行、snapshot-read-start-fake.tsはcreateSnapshotReadStartFakeだけをre-exportする2行とした。従来のread-hash-fake.tsは変更せず、B factoryを従来のpath経由でre-exportする。
- 共通moduleのexportは既存診断factoryの2つだけ。旧3pathのexport集合・各factory関数参照・facadeのmethod集合は維持する。kernel／SourceOps／Snapshot／Borrow・adopt helperはexportしない。

新規snapshot-read-composition.test.ts、既存compiled-declared-actual.mjsのloader／export対照、package-http-classification.mjsの梱包負対照を更新し、CHANGELOG・設計書・親2文書を更新した。既存B・宣言／actual・容量・C-start・機械的抽出試験の期待値、src・配布manifest・設定は変更していない。

## 移動前後の直接比較

基準HEADの2fileと移行先の本文を文字列比較した。Bの本体、上記3内部名だけを変えたC-startの本体、配置用コメント・import以外に差はないことを確認した。これは機械移動の確認であり、実source内容hash照合ではない。

基準HEADのB／C-startをそれぞれcompileし、現在のcomposition moduleを別にcompileして、公開結果をdeep比較した。Cの純粋source-map依存は同一の実装を解決し、コピーした代替検査器は使っていない。

| 比較 | 結果 |
|---|---|
| B全66selector | 完走結果＋各0〜12step後のfinish、計924通りが一致 |
| C-start全25selector | check／begin／prepare／close／finishの長さ4の全625操作列を各selectorに実行、計15,625列が一致 |
| C-startの照合点 | 各4操作の戻り値とinspect、末尾finishを計78,125単位で比較し一致 |

同moduleに置くことと同owner／同sessionになることは別である。新試験ではC close／borrow退役が進行中Bを停止させないこと、B成功がCのopen／read／hash／cleanupを増やさないことを確認した。互いのfactory／facade／summaryをsourceとして渡しても拒否し、caller Proxy／callbackを実行しない。

## compiled保証の維持と初回失敗

移動前に対象5試験file、135件の成功を確認した。新しい配置試験は移動先moduleが存在しない段階でmodule-not-foundとなり失敗し、移行後に成功した。これは配置境界のREDであり、新たな機能実装のREDとは主張しない。

本体移動直後、旧compiled fixtureを未変更で実行すると、旧入口のre-exportをdata URLから解決できずERR_UNSUPPORTED_RESOLVE_REQUESTで失敗した。設計draft-0.2が指摘したloader前提の不一致であり、失敗を隠してcompiled保証を維持したとは記録しない。

compiled fixtureは次の方式へ変更した。

1. 移行先composition moduleのTS本文を変異対象として読み、8変異位置が各1回だけ現れることを維持する。
2. OSの一時作業領域に専用scratch directoryを作り、既存source-map-values-coreとcomposition module、旧3facadeをESMへtranspileする。相対importをfile URLで解決し、純粋値検査をcompositionへ複製しない。
3. 共通moduleのexport集合は2factoryと明示照合し、旧3pathのexport集合は従来の単独factoryと別に照合する。同じfactory関数参照であることも確認する。
4. C-startのpreparedがreadKernel=not_connected、open／read／hash／cleanup=0を保つことをcompiled実行でも確認する。
5. 従来の8変異を別々のmodule名へcompileし、同じ条件で全検出する。宣言補正・actual残量無視・EOF境界・probe省略・余剰hash・scratch全体hash・after stamp省略・event再適用という変異内容／期待条件は削除・弱化していない。
6. 成否にかかわらずfinallyで専用scratchだけを削除する。tests／src／dist・配布物へ一時JSやpackage.jsonを残さない。

読み込むのは合成試験用codeだけで、対象sourceの期待hash pin／実source照合ではない。transpile成功だけをstrict型検査の代用にはしない。

## 検証結果

| 確認 | 結果 |
|---|---|
| 配置前の既存主要5file | 135件成功 |
| 配置後の同5file＋新配置試験 | 6file、141件成功（新規6件を含む）、失敗0 |
| 関連合成回帰 | 20file、1,366件成功、失敗0 |
| 機械移動の本文比較 | B同一、Cは上記3識別子変更のみ |
| B／C直接結果比較 | 924通り／15,625操作列が一致 |
| strict TypeScript | 移行本体・互換入口・配置／宣言actual／互換試験、noUnusedLocals／noUnusedParameters込みで成功 |
| ESLint | 変更・追加6コードfileでエラー／警告0 |
| npm run build | 成功 |
| compiled-declared-actual.mjs単独 | 75件grid・8変異検出・旧3factory互換・C未接続のassert成功 |
| package-http-classification.mjs | 全体成功。従来compiled対照を含めて実行し、末尾の移行後compiled対照も成功 |
| 同scriptのoffline梱包dry-run | 441file、tests／composition／互換factoryの混入なし。5markerのseeded漏えい負対照も成功 |

関連対象はcomposition／declared-actual／kernel-extraction／snapshot-read-start／capacity／B／A／source-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-store。全repository回帰は未実施。期限・cap・既存期待値を緩めていない。梱包は既存scriptの一時cacheを使うoffline dry-runのみで、archive取得／公開や依存導入は行っていない。

## 未実装・停止状態

同一moduleに配置しただけで、C-startからB constructorを呼ぶ継続はない。C preparedは先頭fileのidentity-only準備のままで、全file供給表・view・下位移譲claim、同canonical用adapter・実budget／stop／非空cleanup custodyの接続は未実装。

Bのmodel・D_stop900／D_end1000・guard上界131,524と全cap、C-startの既存状態／計数／閉鎖schemaは変更していない。Cのopaque budget originを実予算にしない。物理同居・旧結果一致を、行hash集約・追加work／heap／native上界・実E／S・接続完了の証拠へ昇格しない。

C実行入口・正式発行口閉鎖、全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushは行っていない。今回の変更は未コミット。

## コミット前の対象限定再検証

上記「未コミット」は記録作成時点の状態。今回の11ファイルだけをindexへ登録し、そのindexを新しい一時作業ツリーへ展開した。依存node_modulesへの参照だけを追加し、元の作業ツリーの未登録変更や既存distを取り込まず、同候補で再検証した。

- npm run build: 成功。
- 関連20ファイル: 1,366件成功、失敗0。期限・cap・既存期待値の緩和なし。
- strict TypeScript（noUnusedLocals／noUnusedParameters込み）、変更・追加6コードfileのESLint: 成功。
- package-http-classification.mjs: 全体成功。移行後のcompiled対照で75件grid・8変異・旧3factoryのexport／関数参照互換・C未接続も確認。
- 同scriptのoffline梱包dry-run: 441file、tests／composition／互換factory混入なし。5markerのseeded漏えい負対照も成功。
- 基準HEADと候補のB本体・C-startの3内部名変更後の本体が一致し、compiled fixtureの8変異の定義部分も移行前と同一。
- 対象4文書のローカルリンク29件・末尾空白、indexの差分形式: 正常。

追記は検証結果だけで、検証済みの実装・試験は変更していない。供給表・view・下位移譲claimは生成せず、C実行入口・正式発行口閉鎖、全体受付無効・Unknown・調査保留を維持する。実接続・実通信・設定変更・Pushは行っていない。
