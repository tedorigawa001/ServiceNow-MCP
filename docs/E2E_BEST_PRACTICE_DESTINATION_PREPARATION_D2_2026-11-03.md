# OB-03 D2：同pendingのContentChecked・未公開dest・一度限り準備

Date: 2026-11-03 / 実装開始HEAD: `f467fc4`／最終確認時HEAD: `f81be78`。
Scope: [OB-03設計§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB03_DESTINATION_CONTENT_DESIGN.md)のD2。固定abort・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。commit・seal成功・実接続は行わない。

## 1 実装範囲

package除外のfresh factory `createSyntheticDestinationPreparationRoot`を追加。callerがmode／owner／旧handleを指定する契約は作らず、同module内で固定D2継続を選ぶ。旧normal transferのAPI・D1非呼出し・固定abortは不変。新rootは旧abortBoundTransferを公開せず、固定`prepareDestination`を持つ。

同construction tokenを持つ唯一のDestinationOwnerをDATA検査前に確保し、準備claimをpre guard前に消費する。workでは同pendingのrow／pins／taken／headerの既存検査後に、同modelのP0／元列・親変換後assets／Pp／traceと、同pinsの版／rulesetをD1へ渡す。

PendingContentCheckは同owner／pending object／model／header／budget identity・serial／失効serialとD1 draftを束ねる。post guard通過後の再照合だけがprivate ContentCheckedと同ownerの未公開dest準備slotを一度生成できる。prefix関係値は既存consumerで消費し、固定state abortで全参照を破棄する。published／sealsは常に0で、成功handleを返さない。

clear／isClearedへ新owner・candidate・checked・dest slotを追加し、上位custody移譲前に全保持を外す。上位に渡すのは既存cleanup-onlyと固定診断であり、本文やmanifestを入れない。prepare後に復元・再準備・D3へのresumeはできない。

## 2 合成試験と負の対照

[新試験](../tests/review/synthetic-destination-preparation.test.ts)の13件で以下を確認した。guardでは観測値だけを保存し、assertionは外側で行う。値helperのspyはVitestの試験器材だけであり、runtime friend／依存差替え口を追加していない。

| 条件 | 確認結果 |
| --- | --- |
| 元reviewed0件／mixed | preでclaim済み・content calls0、postで候補1だがchecks／preparations0。通過後に各1となり、固定abortで全slotが空になる |
| mixed全行 | reviewed keep／親omitted／元worker omitted／retainedの対応と親prefix追加を維持。D1を1回だけ呼ぶ |
| 取消／期限／throw／未知戻り | preではD1呼出し0、postでは1。いずれもContentChecked／dest準備0で停止・全破棄し、同custodyへ移譲可能 |
| body不一致＋post停止 | candidate recommendationだけを変えて実D1がcontent/mismatchを返す。postまではfirst_failure未設定、取消／期限を優先し、なければbinding拒否 |
| swallowed再入 | 再生成せずreentrantを保持し、候補・ownerをclearしてcustodyを維持 |
| source／cleanup失効 | D1呼出し0・準備0。ownerを復元しない |
| 別root summary／余分な引数 | binding拒否で準備claimを失効。他rootは不変 |
| 旧経路 | 旧abortBoundTransferはD1を呼ばず、prepareDestinationやdestination inspect項目も追加されない |
| 初期不正DATA | accessorを実行せず、確保済みownerをclear。resource不存在を捏造せずrelease=unconfirmedを保持 |

negative controlとしてD2のmanifest prefix供給だけをPpからP0へ一時変更した。mixed経路が**1件失敗・12件skip**となり、post時点で候補がない差を検出した。正しい供給へ戻した後、最終回帰は成功。

## 3 初回3件失敗と試験の修正

初回は13件中3件失敗・10件成功。不一致注入の試験が入力全体をstructuredCloneしたため、元列のkept reviewedと候補manifestの同一objectというaliasまで保存された。候補recommendationを書き換えると元列も同時に変わり、D1は値一致として正しく候補を返していた。

デバッグ手順で元列と候補の参照を観測し、共有されていることを確認した。候補manifestだけを追加cloneしてから変更するよう試験器材を修正し、aliasの観測値も呼出し外でassertした。その後13件成功。D1／製品の比較規則・上限・期限は緩めていない。

この結果は、D1の値一致だけをprovenanceとみなさない設計とも整合する。D2のprivate由来結合は元pending参照を保持する側の責務であり、spyが試験用に持つ引数参照を実行時APIへ追加した保証ではない。

## 4 最終確認

- `bdo npm run build`：成功（製品src）。
- `bdo npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck tests/review/synthetic-destination-preparation.test.ts`：成功（試験／kernel等の依存）。
- `bdo npx vitest run tests/review/synthetic-*.test.ts`：**45ファイル・3,524件成功**。既存D1追加試験8件の`f81be78`を保持した3,511件にD2の13件が加わる。
- `bdo node tests/review/package-http-classification.mjs`：**成功、441ファイル**。新factory／private型の漏出負の対照、固定D1依存、配布除外と既存compiled試験を確認。
- `bdo git diff --check`：成功。

D2新root専用のcompiled実行fixture・全機能の全体回帰は未追加／未実行。既存compiled試験の成功をD2専用compiled保証とはみなさない。実接続・実通信・実機操作・設定変更・Pushは行っていない。

## 5 残課題・保証しないこと

D3のfull accepted projectionの同take受領、完成expectation＋manifest bundle・atomic commit／同期失効、D4正常terminal-onlyは未実装。未公開dest準備は完成bundleやsealではない。D2の固定abort済みrootからContentCheckedを再発行せず、次工程もfresh継続で検証する。

実session／worker／wire由来、full header一致、全work／heap・copyピーク／3round配賦はUnknown。同budget不変は追加演算を無料扱いする証拠ではない。参照clearも物理消去やOS cleanup確認ではなく、不足する4roleの証拠を新ownerの生成／破棄で補わない。
